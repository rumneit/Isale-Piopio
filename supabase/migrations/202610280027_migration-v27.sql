-- =============================================================
-- PioPio — Migration v27: NỀN MÓNG TỒN KHO — SỔ CÁI (Inventory Ledger)
-- =============================================================
-- Chạy trong Supabase Dashboard → SQL Editor. Idempotent (if not exists /
-- create or replace / drop trigger if exists trước create).
--
-- Thiết kế (audit isale-warehouse/AUDIT-REPORT.md, phần C4 + D3-P0):
--   * Mọi biến động tồn kho là 1 dòng ledger BẤT BIẾN (insert-only).
--     Tồn hiện tại = products.stock (bảng điều khiển projection), được cập nhật
--     CÙNG TRANSACTION với dòng ledger — client KHÔNG ĐƯỢC cộng/trừ stock nữa.
--   * POS trừ tồn TỰ ĐỘNG bằng trigger trên orders/order_items
--     (lấp lỗ hổng lớn nhất: trước đây bán hàng không đụng tồn kho).
--     Đơn tính tồn khi status NOT IN ('draft','quote','cancelled') —
--     thống nhất với rule doanh thu của report v26. Hủy đơn → dòng đảo (reversal).
--   * Chặn âm kho cho luồng XUẤT NỘI BỘ (transfer_out). Với BÁN HÀNG (sale)
--     cho phép âm tạm thời: tồn lịch sử chưa chuẩn, chặn cứng sẽ làm treo POS —
--     số âm là tín hiệu để chạy kiểm kê (workflow sửa đúng).
--   * Idempotency: pg_advisory_xact_lock theo (ref_type, ref_id) + EXISTS —
--     double-click / retry / sync lại không sinh dòng kép.
--   * Kiểm kê chốt theo RE-BASE: diff = số đếm − tồn HIỆN TẠI (khoá dòng SP),
--     bán hàng trong lúc kiểm kê không làm sai kết quả.
--   * Audit: inventory_audit append-only + trigger ghi vặn chỉnh stock tay
--     (outside ledger) + lịch sử 3 bảng phiếu.
--   * Bảo mật: RLS member-only (is_shop_member — chuẩn v26); ledger/audit
--     chỉ ghi được qua hàm/trigger SECURITY DEFINER (không có policy insert).
--
-- TƯƠNG THÍCH NGƯỢC: không đụng cột/cụm hiện có. Stock giữ nguyên giá trị
-- (không backfill — ledger ghi từ ngày triển khai trở đi). Client cũ chưa nâng
-- code vẫn chạy (fallback), chỉ khi chạy migration này RPC mới tồn tại.
-- =============================================================

-- ---------- 1. Bảng sổ cái tồn kho (append-only) ----------
create table if not exists public.inventory_ledger (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  product_id uuid,                          -- null = dòng không gắn SP (hiếm)
  product_name text,                        -- snapshot tên SP lúc ghi
  qty numeric(14, 3) not null,              -- + nhập/hoàn, − xuất/mất (bán hàng lưu ÂM)
  cost numeric(14, 2),                      -- snapshot giá vốn lúc ghi
  ref_type text not null check (ref_type in
    ('received_note', 'return_note', 'transfer_out', 'transfer_loss',
     'stock_count', 'sale', 'sale_return', 'manual_adjust')),
  ref_id uuid not null,                     -- id phiếu/đơn nguồn (bất biến)
  line_id uuid,                             -- id dòng nguồn (order_items.id) nếu có
  ref_code text,                            -- mã phiếu hiển thị (PN-…, DH-…)
  reversal_of uuid references public.inventory_ledger (id),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists inventory_ledger_shop_time_idx
  on public.inventory_ledger (shop_id, created_at desc);
create index if not exists inventory_ledger_product_idx
  on public.inventory_ledger (product_id, created_at desc);
create index if not exists inventory_ledger_ref_idx
  on public.inventory_ledger (ref_type, ref_id);

alter table public.inventory_ledger enable row level security;

drop policy if exists "ledger read" on public.inventory_ledger;
create policy "ledger read" on public.inventory_ledger
  for select using (public.is_shop_member(shop_id));
-- (không policy insert/update/delete → chỉ SECURITY DEFINER ghi được)

-- ---------- 2. Bảng audit trail (append-only) ----------
create table if not exists public.inventory_audit (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in
    ('create', 'update', 'delete', 'manual_adjust')),
  actor_id uuid,                            -- auth.uid() lúc ghi (nullable với anon)
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index if not exists inventory_audit_ref_idx
  on public.inventory_audit (table_name, record_id, created_at desc);

alter table public.inventory_audit enable row level security;

drop policy if exists "audit read" on public.inventory_audit;
create policy "audit read" on public.inventory_audit
  for select using (public.is_shop_member(shop_id));
-- (append-only: không policy ghi cho client)

-- ---------- 3. Guard dùng chung ----------
create or replace function public._inv_assert_member(p_shop uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_shop_member(p_shop) then
    raise exception 'Bạn không có quyền thao tác kho của cửa hàng này.';
  end if;
end;
$$;

-- ---------- 4. Helper nội bộ ----------
-- 4a. Đánh dấu transaction đang ghi ledger (products.stock watch sẽ bỏ qua)
create or replace function public._inv_ledger_begin()
returns void
language sql
security definer
set search_path = public
as $$
  select set_config('app.ledger_writing', '1', true);
$$;

-- 4b. Quyền "đơn tính tồn": thống nhất rule doanh thu v26
create or replace function public._inv_stock_status(p_status text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_status, 'completed') not in ('draft', 'quote', 'cancelled');
$$;

-- 4c. Ghi 1 dòng ledger + cập nhật tồn (caller phải đã khoá dòng SP + _inv_ledger_begin)
create or replace function public._inv_ledger_insert(
  p_shop uuid, p_ref_type text, p_ref_id uuid, p_ref_code text,
  p_line_id uuid, p_product_id uuid, p_name text,
  p_qty numeric, p_cost numeric default null, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_cost numeric;
begin
  if p_product_id is null or p_qty = 0 then return; end if;
  if p_cost is not null then v_cost := p_cost; else
    select pr.cost into v_cost from products pr where pr.id = p_product_id;
  end if;
  insert into inventory_ledger (shop_id, product_id, product_name, qty, cost,
                                ref_type, ref_id, line_id, ref_code, note)
  values (p_shop, p_product_id, p_name, p_qty, v_cost,
          p_ref_type, p_ref_id, p_line_id, p_ref_code, p_note);
  update products pr
     set stock = pr.stock + p_qty
   where pr.id = p_product_id;
end;
$$;

-- 4d. Khoá dòng SP theo thứ tự product_id (chống deadlock)
create or replace function public._inv_lock_products(p_ids jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  for r in
    select distinct (x->>'product_id')::uuid as pid
    from jsonb_array_elements(case when jsonb_typeof(p_ids) = 'array' then p_ids else '[]'::jsonb end) x
    where coalesce(x->>'product_id', '') <> ''
    order by 1
  loop
    perform 1 from products pr where pr.id = r.pid for update;
  end loop;
end;
$$;

-- 4e. Đảo dấu toàn bộ (hoặc 1 line) ledger của 1 ref — idempotent
create or replace function public._inv_ledger_reverse(
  p_shop uuid, p_ref_type text, p_ref_id uuid, p_only_line uuid default null
)
returns boolean   -- true nếu đã đảo (hoặc đã đảo trước đó), false nếu không có gì để đảo
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_any boolean := false;
begin
  perform public._inv_ledger_begin();
  perform public._inv_lock_products(
    jsonb_agg(jsonb_build_object('product_id', l.product_id))
  )
    from inventory_ledger l
    where l.ref_type = p_ref_type and l.ref_id = p_ref_id and l.reversal_of is null;

  for r in
    select l.*
    from inventory_ledger l
    where l.ref_type = p_ref_type and l.ref_id = p_ref_id
      and l.reversal_of is null
      and (p_only_line is null or l.line_id = p_only_line)
      and not exists (
        select 1 from inventory_ledger rv
        where rv.reversal_of = l.id
      )
    order by l.product_id
  loop
    v_any := true;
    insert into inventory_ledger (shop_id, product_id, product_name, qty, cost,
                                  ref_type, ref_id, line_id, ref_code,
                                  reversal_of, note)
    values (r.shop_id, r.product_id, r.product_name, -r.qty, r.cost,
            r.ref_type, r.ref_id, r.line_id, r.ref_code,
            r.id, 'Reversal');
    update products pr set stock = pr.stock - r.qty where pr.id = r.product_id;
  end loop;
  return v_any;
end;
$$;

-- ---------- 5. RPC cho client (thay thế cộng/trừ stock client-side) ----------
-- 5a. Áp dụng phiếu: received_note (+), return_note (+), transfer_out (−)
--     p_items: [{product_id, name, qty, cost?}] — qty là SỐ LƯỢNG DƯƠNG,
--     dấu do ref_type quyết định. Trả true nếu đã áp, false nếu áp trước đó.
create or replace function public.inv_apply_note(
  p_shop uuid, p_ref_type text, p_ref_id uuid, p_items jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_code text;
begin
  perform public._inv_assert_member(p_shop);
  if p_ref_type not in ('received_note', 'return_note', 'transfer_out') then
    raise exception 'ref_type không hỗ trợ: %', p_ref_type;
  end if;

  -- Phiếu phải thuộc shop này (chống gắn ref chéo cửa hàng)
  if p_ref_type = 'received_note' then
    select code into v_code from received_notes where id = p_ref_id and shop_id = p_shop;
  elsif p_ref_type = 'return_note' then
    select code into v_code from return_notes where id = p_ref_id and shop_id = p_shop;
  else
    select code into v_code from transfers where id = p_ref_id and shop_id = p_shop;
  end if;
  if v_code is null then
    raise exception 'Phiếu không tồn tại hoặc không thuộc cửa hàng này.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_ref_type || ':' || p_ref_id::text, 0));
  if exists (select 1 from inventory_ledger
             where ref_type = p_ref_type and ref_id = p_ref_id and reversal_of is null) then
    return false;   -- đã áp trước đó (retry/double-click) — no-op
  end if;

  perform public._inv_ledger_begin();
  perform public._inv_lock_products(p_items);

  for r in
    select x,
           (x->>'product_id')::uuid as pid,
           coalesce(nullif(x->>'qty', '')::numeric, 0) as q,
           nullif(x->>'cost', '')::numeric as c,
           coalesce(x->>'name', '') as nm
    from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) x
    where coalesce(x->>'product_id', '') <> ''
    order by 2
  loop
    if r.q <= 0 then
      raise exception 'Số lượng phải lớn hơn 0: %', r.nm;
    end if;
    -- SP phải thuộc shop
    if not exists (select 1 from products pr where pr.id = r.pid and pr.shop_id = p_shop) then
      raise exception 'Sản phẩm không thuộc cửa hàng: %', r.nm;
    end if;
    -- Chặn âm kho cho luồng xuất nội bộ
    if p_ref_type = 'transfer_out' then
      if coalesce((select pr.stock from products pr where pr.id = r.pid), 0) < r.q then
        raise exception 'Không đủ tồn kho để chuyển: %', r.nm;
      end if;
    end if;
    perform public._inv_ledger_insert(
      p_shop, p_ref_type, p_ref_id, v_code, null, r.pid, r.nm,
      case when p_ref_type = 'transfer_out' then -r.q else r.q end,
      r.c, null
    );
  end loop;
  return true;
end;
$$;

-- 5b. Đảo phiếu khi xoá (received_note / return_note / transfer_out)
create or replace function public.inv_reverse_note(
  p_shop uuid, p_ref_type text, p_ref_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._inv_assert_member(p_shop);
  if p_ref_type not in ('received_note', 'return_note', 'transfer_out') then
    raise exception 'ref_type không hỗ trợ: %', p_ref_type;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_ref_type || ':' || p_ref_id::text, 0));
  return public._inv_ledger_reverse(p_shop, p_ref_type, p_ref_id, null);
end;
$$;

-- 5c. Chốt kiểm kê theo RE-BASE: diff = số đếm − tồn hiện tại (khoá dòng SP).
--     Trả về items đã tính lại để client ghi vào phiếu.
--     p_items: [{product_id, name, system_qty, counted_qty}]
create or replace function public.inv_complete_stockcount(
  p_shop uuid, p_count_id uuid, p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_stock_before numeric; v_diff numeric; v_code text;
        v_out jsonb := '[]'::jsonb; v_total numeric := 0; v_applied boolean := false;
begin
  perform public._inv_assert_member(p_shop);
  select code into v_code from stock_counts where id = p_count_id and shop_id = p_shop;
  if v_code is null then
    raise exception 'Phiếu kiểm kê không tồn tại hoặc không thuộc cửa hàng này.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stock_count:' || p_count_id::text, 0));
  if exists (select 1 from inventory_ledger
             where ref_type = 'stock_count' and ref_id = p_count_id and reversal_of is null) then
    return jsonb_build_object('already', true, 'items', '[]'::jsonb);
  end if;

  perform public._inv_ledger_begin();
  perform public._inv_lock_products(p_items);

  for r in
    select x,
           (x->>'product_id')::uuid as pid,
           coalesce(nullif(x->>'counted_qty', '')::numeric, 0) as counted,
           coalesce(x->>'name', '') as nm
    from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) x
    where coalesce(x->>'product_id', '') <> ''
    order by 2
  loop
    if not exists (select 1 from products pr where pr.id = r.pid and pr.shop_id = p_shop) then
      raise exception 'Sản phẩm không thuộc cửa hàng: %', r.nm;
    end if;
    select pr.stock into v_stock_before from products pr where pr.id = r.pid;
    v_diff := r.counted - v_stock_before;
    if v_diff <> 0 then
      v_applied := true;
      perform public._inv_ledger_insert(
        p_shop, 'stock_count', p_count_id, v_code, null, r.pid, r.nm,
        v_diff, null, format('Kiểm kê: hệ thống %s → thực %s', v_stock_before, r.counted)
      );
    end if;
    v_total := v_total + v_diff;
    v_out := v_out || jsonb_build_object(
      'product_id', r.pid, 'name', r.nm,
      'system_qty', v_stock_before, 'counted_qty', r.counted, 'diff', v_diff);
  end loop;

  return jsonb_build_object('already', false, 'items', v_out, 'total_diff', v_total, 'changed', v_applied);
end;
$$;

-- 5d. Lịch sử thay đổi 1 bản ghi (audit trail UI)
create or replace function public.inv_history(
  p_shop uuid, p_table text, p_record_id uuid, p_limit int default 100
)
returns table (action text, actor_id uuid, before jsonb, after jsonb, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._inv_assert_member(p_shop);
  if p_table not in ('received_notes', 'transfers', 'stock_counts', 'products') then
    raise exception 'Bảng không hỗ trợ: %', p_table;
  end if;
  return query
  select a.action, a.actor_id, a.before, a.after, a.created_at
  from inventory_audit a
  where a.shop_id = p_shop and a.table_name = p_table and a.record_id = p_record_id
  order by a.created_at desc
  limit least(coalesce(p_limit, 100), 500);
end;
$$;

-- ---------- 6. Trigger: ĐƠN HÀNG TỰ TRỪ TỒN (lấp lỗ hổng POS) ----------
-- 6a. Insert order_item → đơn đang "tính tồn" thì ghi sale (qty âm)
create or replace function public._inv_order_item_ins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_shop uuid; v_status text; v_code text;
begin
  if new.product_id is null then return new; end if;
  select o.shop_id, o.status, o.code into v_shop, v_status, v_code
    from orders o where o.id = new.order_id;
  if v_shop is null then return new; end if;   -- không có đơn cha (lạ) → bỏ qua
  if not public._inv_stock_status(v_status) then return new; end if;
  perform public._inv_ledger_begin();
  perform public._inv_lock_products(jsonb_build_array(jsonb_build_object('product_id', new.product_id)));
  perform public._inv_ledger_insert(
    v_shop, 'sale', new.order_id, v_code, new.id, new.product_id, new.name,
    -new.qty, null, null);
  return new;
end;
$$;

drop trigger if exists inv_order_item_ins on public.order_items;
create trigger inv_order_item_ins
  after insert on public.order_items
  for each row execute function public._inv_order_item_ins();

-- 6b. Xoá order_item (xoá lẻ) → đảo dòng đó. Nếu là cascade do xoá đơn thì
--     đơn cha đã biến mất → bỏ qua (trigger xoá đơn lo toàn bộ).
create or replace function public._inv_order_item_del()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_shop uuid; v_status text;
begin
  if old.product_id is null then return old; end if;
  select o.shop_id, o.status into v_shop, v_status from orders o where o.id = old.order_id;
  if v_shop is null then return old; end if;   -- cascade từ orders → _inv_order_del lo
  if not public._inv_stock_status(v_status) then return old; end if;
  perform pg_advisory_xact_lock(hashtextextended('sale:' || old.order_id::text, 0));
  perform public._inv_ledger_reverse(v_shop, 'sale', old.order_id, old.id);
  return old;
end;
$$;

drop trigger if exists inv_order_item_del on public.order_items;
create trigger inv_order_item_del
  after delete on public.order_items
  for each row execute function public._inv_order_item_del();

-- 6c. Đổi trạng thái đơn → vào nhóm tính tồn: áp; rời nhóm: đảo
create or replace function public._inv_order_status_chg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare it record; v_old_in boolean; v_new_in boolean;
begin
  if new.status is not distinct from old.status then return new; end if;
  v_old_in := public._inv_stock_status(old.status);
  v_new_in := public._inv_stock_status(new.status);
  if v_old_in = v_new_in then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended('sale:' || new.id::text, 0));

  if v_new_in then
    perform public._inv_ledger_begin();
    perform public._inv_lock_products(
      (select coalesce(jsonb_agg(jsonb_build_object('product_id', oi.product_id)), '[]'::jsonb)
         from order_items oi where oi.order_id = new.id));
    for it in
      select oi.* from order_items oi
      where oi.order_id = new.id and oi.product_id is not null
      order by oi.product_id
    loop
      perform public._inv_ledger_insert(
        new.shop_id, 'sale', new.id, new.code, it.id, it.product_id, it.name,
        -it.qty, null, null);
    end loop;
  else
    perform public._inv_ledger_reverse(new.shop_id, 'sale', new.id, null);
  end if;
  return new;
end;
$$;

drop trigger if exists inv_order_status_chg on public.orders;
create trigger inv_order_status_chg
  after update of status on public.orders
  for each row execute function public._inv_order_status_chg();

-- 6d. Xoá đơn → đảo toàn bộ sale của đơn
create or replace function public._inv_order_del()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('sale:' || old.id::text, 0));
  perform public._inv_ledger_reverse(old.shop_id, 'sale', old.id, null);
  return old;
end;
$$;

drop trigger if exists inv_order_del on public.orders;
create trigger inv_order_del
  after delete on public.orders
  for each row execute function public._inv_order_del();

-- ---------- 7. Trigger audit ----------
-- 7a. Vặn chỉnh stock TRỰC TIẾP trên products (ngoài ledger) → ghi audit
create or replace function public._inv_products_stock_watch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stock is not distinct from old.stock then return new; end if;
  if coalesce(current_setting('app.ledger_writing', true), '') = '1' then
    return new;   -- đang ghi qua ledger → bình thường, không log
  end if;
  insert into inventory_audit (shop_id, table_name, record_id, action, actor_id, before, after)
  values (new.shop_id, 'products', new.id, 'manual_adjust', auth.uid(),
          jsonb_build_object('stock', old.stock, 'cost', old.cost),
          jsonb_build_object('stock', new.stock, 'cost', new.cost));
  return new;
end;
$$;

drop trigger if exists inv_products_stock_watch on public.products;
create trigger inv_products_stock_watch
  after update of stock on public.products
  for each row execute function public._inv_products_stock_watch();

-- 7b. Lịch sử 3 bảng phiếu (create/update/delete)
create or replace function public._inv_note_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_action text; v_shop uuid; v_id uuid; v_before jsonb; v_after jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := 'create'; v_after := to_jsonb(new);
    v_shop := new.shop_id; v_id := new.id;
  elsif tg_op = 'UPDATE' then
    v_action := 'update'; v_before := to_jsonb(old); v_after := to_jsonb(new);
    v_shop := new.shop_id; v_id := new.id;
    if v_before is not distinct from v_after then return coalesce(new, old); end if;
  else
    v_action := 'delete'; v_before := to_jsonb(old);
    v_shop := old.shop_id; v_id := old.id;
  end if;
  insert into inventory_audit (shop_id, table_name, record_id, action, actor_id, before, after)
  values (v_shop, tg_table_name, v_id, v_action, auth.uid(), v_before, v_after);
  return coalesce(new, old);
end;
$$;

drop trigger if exists inv_audit_received_notes on public.received_notes;
create trigger inv_audit_received_notes
  after insert or update or delete on public.received_notes
  for each row execute function public._inv_note_audit();

drop trigger if exists inv_audit_transfers on public.transfers;
create trigger inv_audit_transfers
  after insert or update or delete on public.transfers
  for each row execute function public._inv_note_audit();

drop trigger if exists inv_audit_stock_counts on public.stock_counts;
create trigger inv_audit_stock_counts
  after insert or update or delete on public.stock_counts
  for each row execute function public._inv_note_audit();

-- ---------- 8. Ghi chú vận hành ----------
-- * Kiểm tra nhanh sau khi chạy:
--     select ref_type, count(*), sum(qty) from inventory_ledger group by 1;
--     select table_name, action, count(*) from inventory_audit group by 1, 2;
-- * Kiểm tra "không mất đồng bộ" tồn vs ledger (cho phép khác do dữ liệu cũ):
--     select p.id, p.name, p.stock,
--            coalesce(l.s, 0) as ledger_delta
--     from products p
--     left join (select product_id, sum(qty) s from inventory_ledger group by 1) l
--       on l.product_id = p.id
--     where p.stock <> coalesce(l.s, 0)
--     order by p.name limit 50;
--   (bất kỳ dòng nào lệch = dữ liệu cũ trước ledger — dùng kiểm kê để chuẩn hoá)

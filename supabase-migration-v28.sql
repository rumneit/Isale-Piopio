-- =============================================================
-- PioPio — Migration v28: P1 QUY TRÌNH & TIỀN
--   1) suppliers — Nhà cung cấp (entity thật, thay supplier_name free-text)
--   2) supplier_debts — Công nợ phải trả NCC (AP) + hạn thanh toán
--   3) received_notes +supplier_id/paid_amount/due_date (nhập nợ, trả trước)
--   4) transfers +status/received_at — In-Transit: chốt phiếu trừ tồn nguồn,
--      "Nhận hàng" đối soát xuất/nhận, hao hụt lưu transfer_losses
--   5) transactions +supplier_debt_id (liên kết phiếu chi trả nợ)
--   6) RPC: inv_create_transfer (tạo phiếu + trừ tồn 1 transaction, chặn âm),
--      inv_receive_transfer (đối soát + write-off/hoàn nguồn), sup_debts,
--      sup_pay_debt (idempotent theo nonce), sup_debt_payments
-- Bảo mật: RLS is_shop_member (chuẩn v26/v27); audit trigger tái dùng
-- _inv_note_audit (generic). Idempotent: chạy lại an toàn.
-- =============================================================

-- ---------- 1. suppliers ----------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  phone text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists suppliers_shop_idx on public.suppliers (shop_id, name);

alter table public.suppliers enable row level security;
drop policy if exists "shop member all" on public.suppliers;
create policy "shop member all" on public.suppliers
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

-- ---------- 2. supplier_debts (AP) ----------
create table if not exists public.supplier_debts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  received_note_id uuid references public.received_notes (id) on delete set null,
  amount numeric(14, 2) not null default 0 check (amount > 0),
  paid_amount numeric(14, 2) not null default 0,
  due_date date,
  status text not null default 'open' check (status in ('open', 'partial', 'paid', 'cancelled')),
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists supplier_debts_shop_idx on public.supplier_debts (shop_id, status, due_date);
create index if not exists supplier_debts_supplier_idx on public.supplier_debts (supplier_id);

alter table public.supplier_debts enable row level security;
drop policy if exists "shop member all" on public.supplier_debts;
create policy "shop member all" on public.supplier_debts
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

-- ---------- 3. received_notes: cột mới (additive) ----------
alter table public.received_notes
  add column if not exists supplier_id uuid references public.suppliers (id) on delete set null,
  add column if not exists paid_amount numeric(14, 2) not null default 0,
  add column if not exists due_date date;

-- ---------- 4. transfers: in-transit ----------
alter table public.transfers
  add column if not exists status text not null default 'completed',   -- legacy = completed (đã trừ tồn tức thì)
  add column if not exists received_at timestamptz,
  add column if not exists completed_by text;

-- ---------- 5. transfer_losses ----------
create table if not exists public.transfer_losses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  transfer_id uuid not null references public.transfers (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text,
  qty numeric(14, 3) not null check (qty > 0),
  reason text not null check (reason in ('damaged', 'lost', 'wrong_item', 'other')),
  reason_note text,
  resolution text not null default 'write_off' check (resolution in ('write_off', 'return_to_source')),
  resolved_by text,
  created_at timestamptz not null default now()
);
create index if not exists transfer_losses_transfer_idx on public.transfer_losses (transfer_id);
create index if not exists transfer_losses_shop_idx on public.transfer_losses (shop_id, created_at desc);

alter table public.transfer_losses enable row level security;
drop policy if exists "shop member read" on public.transfer_losses;
create policy "shop member read" on public.transfer_losses
  for select using (public.is_shop_member(shop_id));
-- (ghi qua RPC security definer)

-- ---------- 6. transactions: liên kết nợ NCC ----------
alter table public.transactions
  add column if not exists supplier_debt_id uuid references public.supplier_debts (id) on delete set null;
create index if not exists transactions_supplier_debt_idx
  on public.transactions (supplier_debt_id) where supplier_debt_id is not null;

-- ---------- 7. RPC nhận hàng chuyển kho (đối soát xuất/nhận) ----------
create or replace function public.inv_create_transfer(
  p_shop uuid, p_code text, p_destination text, p_note text, p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; r record; v_sent numeric;
begin
  perform public._inv_assert_member(p_shop);
  if p_code is null or length(trim(p_code)) = 0 then
    raise exception 'Thiếu mã phiếu.';
  end if;

  -- Khoá dòng SP theo thứ tự, kiểm đủ tồn cho TOÀN phiếu (gộp theo SP)
  perform public._inv_ledger_begin();
  perform public._inv_lock_products(p_items);
  for r in
    select (x->>'product_id')::uuid as pid,
           coalesce(nullif(x->>'name', ''), 'Sản phẩm') as nm,
           sum(coalesce(nullif(x->>'qty', '')::numeric, 0)) as q
    from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) x
    where coalesce(x->>'product_id', '') <> ''
    group by 1, 2
    order by 1
  loop
    if r.q <= 0 then raise exception 'Số lượng chuyển phải lớn hơn 0: %', r.nm; end if;
    if not exists (select 1 from products pr where pr.id = r.pid and pr.shop_id = p_shop) then
      raise exception 'Sản phẩm không thuộc cửa hàng: %', r.nm;
    end if;
    select pr.stock into v_sent from products pr where pr.id = r.pid for update;
    if v_sent < r.q then
      raise exception 'Không đủ tồn kho để chuyển: % (còn %, cần %)', r.nm, v_sent, r.q;
    end if;
  end loop;

  insert into transfers (shop_id, code, destination, items, note, status)
  values (p_shop, trim(p_code), nullif(trim(coalesce(p_destination, '')), ''), p_items,
          nullif(trim(coalesce(p_note, '')), ''), 'in_transit')
  returning id into v_id;

  for r in
    select (x->>'product_id')::uuid as pid,
           coalesce(nullif(x->>'name', ''), 'Sản phẩm') as nm,
           coalesce(nullif(x->>'qty', '')::numeric, 0) as q
    from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) x
    where coalesce(x->>'product_id', '') <> ''
    order by 1
  loop
    perform public._inv_ledger_insert(p_shop, 'transfer_out', v_id, p_code, null, r.pid, r.nm, -r.q, null, null);
  end loop;

  return v_id;
end;
$$;

create or replace function public.inv_receive_transfer(
  p_shop uuid, p_transfer_id uuid, p_items jsonb,
  p_resolution text default 'write_off',
  p_reason text default 'other',
  p_reason_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_code text; v_items_old jsonb; r record; v_old record;
        v_diff numeric; v_has_loss boolean := false;
        v_out jsonb := '[]'::jsonb; v_resolver text; v_items_new jsonb := '[]'::jsonb;
begin
  perform public._inv_assert_member(p_shop);
  if p_resolution not in ('write_off', 'return_to_source') then
    raise exception 'resolution không hợp lệ: %', p_resolution;
  end if;
  if p_reason not in ('damaged', 'lost', 'wrong_item', 'other') then
    raise exception 'Lý do hao hụt không hợp lệ: %', p_reason;
  end if;

  select t.code, t.items into v_code, v_items_old
    from transfers t where t.id = p_transfer_id and t.shop_id = p_shop;
  if v_code is null then
    raise exception 'Phiếu chuyển không tồn tại hoặc không thuộc cửa hàng này.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('transfer_in:' || p_transfer_id::text, 0));
  if exists (select 1 from inventory_ledger
             where ref_type = 'transfer_in' and ref_id = p_transfer_id and reversal_of is null) then
    return jsonb_build_object('already', true, 'items', '[]'::jsonb, 'losses', '[]'::jsonb);
  end if;

  perform public._inv_ledger_begin();
  perform public._inv_lock_products(p_items);

  for r in
    select x,
           (x->>'product_id')::uuid as pid,
           coalesce(nullif(x->>'qty_sent', '')::numeric, 0) as sent,
           coalesce(nullif(x->>'qty_received', '')::numeric, 0) as recv,
           coalesce(x->>'name', '') as nm
    from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) x
    where coalesce(x->>'product_id', '') <> ''
    order by 2
  loop
    if r.recv < 0 then raise exception 'Số lượng nhận không được âm: %', r.nm; end if;
    if r.recv > r.sent then
      raise exception 'Nhận vượt số gửi: % (gửi %, nhận %)', r.nm, r.sent, r.recv;
    end if;
    if not exists (select 1 from products pr where pr.id = r.pid and pr.shop_id = p_shop) then
      raise exception 'Sản phẩm không thuộc cửa hàng: %', r.nm;
    end if;

    -- Tồn đích tăng theo số THỰC NHẬN
    if r.recv > 0 then
      perform public._inv_ledger_insert(p_shop, 'transfer_in', p_transfer_id, v_code, null, r.pid, r.nm, r.recv, null, null);
    end if;

    v_diff := r.sent - r.recv;
    if v_diff > 0 then
      v_has_loss := true;
      -- Hoàn nguồn (xe trả hàng về kho xuất) thì tồn nguồn lấy lại phần hụt
      if p_resolution = 'return_to_source' then
        perform public._inv_ledger_insert(p_shop, 'transfer_loss', p_transfer_id, v_code, null, r.pid, r.nm, v_diff, null, 'Hoàn về kho nguồn');
      end if;
      -- Ghi metadata trách nhiệm (báo cáo hao hụt)
      select full_name into v_resolver from profiles where id = auth.uid();
      insert into transfer_losses (shop_id, transfer_id, product_id, product_name, qty,
                                   reason, reason_note, resolution, resolved_by)
      values (p_shop, p_transfer_id, r.pid, r.nm, v_diff, p_reason,
              nullif(trim(coalesce(p_reason_note, '')), ''), p_resolution, v_resolver);
    end if;

    v_out := v_out || jsonb_build_object('product_id', r.pid, 'name', r.nm,
                                         'qty_sent', r.sent, 'qty_received', r.recv, 'loss', v_diff);
    -- Giữ tên SP gốc trong items của phiếu
    select coalesce(nullif(oe->>'name', ''), r.nm) into v_nm from
      (select e as oe from jsonb_array_elements(case when jsonb_typeof(v_items_old) = 'array' then v_items_old else '[]'::jsonb end) e
        where (e->>'product_id')::uuid = r.pid limit 1) s;
    v_items_new := v_items_new || jsonb_build_object(
      'product_id', r.pid, 'name', coalesce(v_nm, r.nm), 'qty', r.sent, 'qty_received', r.recv);
  end loop;

  if v_has_loss and p_reason_note is null and p_reason = 'other' then
    raise exception 'Hao hụt cần ghi chú lý do.';
  end if;

  select coalesce(full_name, auth.uid()::text) into v_resolver from profiles where id = auth.uid();
  update transfers
     set status = 'completed', received_at = now(), completed_by = v_resolver,
         items = v_items_new
   where id = p_transfer_id and shop_id = p_shop and status = 'in_transit';
  if not found then
    raise exception 'Phiếu không ở trạng thái đang đi (in_transit).';
  end if;

  return jsonb_build_object('already', false, 'items', v_out, 'losses',
    (select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'qty', qty, 'reason', reason)), '[]'::jsonb)
       from transfer_losses where transfer_id = p_transfer_id));
end;
$$;

-- ---------- 8. RPC công nợ NCC ----------
create or replace function public.sup_debts(p_shop uuid, p_status text default null)
returns table (id uuid, supplier_id uuid, supplier_name text, supplier_phone text,
               received_note_id uuid, received_code text, amount numeric,
               paid_amount numeric, remaining numeric, due_date date,
               status text, note text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._inv_assert_member(p_shop);
  return query
  select d.id, d.supplier_id, s.name, s.phone,
         d.received_note_id, rn.code, d.amount,
         d.paid_amount, (d.amount - d.paid_amount),
         d.due_date, d.status, d.note, d.created_at
  from supplier_debts d
  join suppliers s on s.id = d.supplier_id
  left join received_notes rn on rn.id = d.received_note_id
  where d.shop_id = p_shop
    and d.status in ('open', 'partial')
    and (p_status is null or d.status = p_status)
  order by (d.due_date is null), d.due_date, d.created_at desc;
end;
$$;

create or replace function public.sup_pay_debt(
  p_shop uuid, p_debt_id uuid, p_amount numeric,
  p_account_id uuid default null, p_note text default null, p_nonce text default null
)
returns uuid   -- id giao dịch chi (transactions)
language plpgsql
security definer
set search_path = public
as $$
declare v_debt supplier_debts%rowtype; v_txn uuid; v_new_paid numeric; v_payer text;
begin
  perform public._inv_assert_member(p_shop);
  if p_amount is null or p_amount <= 0 then
    raise exception 'Số tiền trả phải lớn hơn 0.';
  end if;

  -- Idempotency theo nonce (double-click / retry)
  if p_nonce is not null then
    select id into v_txn from transactions
     where shop_id = p_shop and client_nonce = p_nonce limit 1;
    if v_txn is not null then return v_txn; end if;
  end if;

  select * into v_debt from supplier_debts
   where id = p_debt_id and shop_id = p_shop for update;
  if not found then raise exception 'Không tìm thấy khoản nợ.'; end if;
  if v_debt.status in ('paid', 'cancelled') then
    raise exception 'Khoản nợ này đã tất toán.';
  end if;
  if p_amount > (v_debt.amount - v_debt.paid_amount) then
    raise exception 'Số tiền vượt nợ còn lại (%).', (v_debt.amount - v_debt.paid_amount)::text;
  end if;

  select coalesce(full_name, auth.uid()::text) into v_payer from profiles where id = auth.uid();

  insert into transactions (shop_id, type, category, amount, account_id, note,
                            occurred_at, source, supplier_debt_id, client_nonce)
  values (p_shop, 'expense', 'Trả NCC', p_amount, p_account_id,
          coalesce(nullif(trim(coalesce(p_note, '')), ''),
                   'Trả nợ NCC' || (select ' ' || s.name from suppliers s where s.id = v_debt.supplier_id)),
          now(), 'supplier_debt', p_debt_id, p_nonce)
  returning id into v_txn;

  v_new_paid := v_debt.paid_amount + p_amount;
  update supplier_debts
     set paid_amount = v_new_paid,
         status = case when v_new_paid >= amount then 'paid' else 'partial' end
   where id = p_debt_id;

  return v_txn;
end;
$$;

create or replace function public.sup_debt_payments(p_shop uuid, p_debt_id uuid)
returns table (id uuid, amount numeric, occurred_at timestamptz, note text, account_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._inv_assert_member(p_shop);
  return query
  select t.id, t.amount, t.occurred_at, t.note, t.account_id
  from transactions t
  where t.shop_id = p_shop and t.supplier_debt_id = p_debt_id
  order by t.occurred_at desc;
end;
$$;

-- ---------- 9. Audit trail cho bảng mới (tái dùng _inv_note_audit v27) ----------
drop trigger if exists inv_audit_suppliers on public.suppliers;
create trigger inv_audit_suppliers
  after insert or update or delete on public.suppliers
  for each row execute function public._inv_note_audit();

drop trigger if exists inv_audit_supplier_debts on public.supplier_debts;
create trigger inv_audit_supplier_debts
  after insert or update or delete on public.supplier_debts
  for each row execute function public._inv_note_audit();

drop trigger if exists inv_audit_transfer_losses on public.transfer_losses;
create trigger inv_audit_transfer_losses
  after insert or update or delete on public.transfer_losses
  for each row execute function public._inv_note_audit();

-- ---------- 10. inv_history: mở rộng whitelist ----------
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
  if p_table not in ('received_notes', 'transfers', 'stock_counts', 'products',
                     'suppliers', 'supplier_debts', 'transfer_losses') then
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

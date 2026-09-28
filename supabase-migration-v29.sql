-- ============================================================================
-- v29 — P1b kho: Maker-checker duyệt phiếu nhập + Partial receipt (nhận thiếu)
-- ============================================================================
-- Nội dung:
--   1) received_notes +status/parent_id/created_by/approved_by/approved_at/
--      reject_reason — trạng thái phiếu nhập:
--        pending   : staff tạo, CHƯA ghi tồn/tiền/công nợ — chờ duyệt
--        partial   : đã ghi nhận hàng nhưng thiếu so với số đặt (qty_ordered)
--        completed : xong (mặc định cho toàn bộ phiếu legacy)
--        cancelled : bị từ chối / huỷ — không bao giờ ghi tồn
--   2) RLS mới thay "shop member all" (v2): ai cũng đọc/được; tạo phiếu chỉ
--      được trạng thái khác 'pending' nếu có quyền inventory_approve
--      (chủ shop luôn có; nhân viên chỉ khi được cấp cờ riêng).
--   3) RPC inv_approve_note(shop, note, nonce): duyệt = 1 transaction ghi
--      tồn (ledger v27, idempotent) + chi tiền ĐÃ TRẢ (client_nonce chống
--      double) + công nợ NCC phần CHƯA TRẢ + chốt trạng thái partial/completed.
--      Cấm tự duyệt phiếu do chính mình tạo (maker-checker).
--   4) RPC inv_reject_note(shop, note, reason): pending → cancelled + lý do.
--   5) RPC inv_open_receive_notes(shop): danh sách phiếu còn THIẾU hàng,
--      tính NET theo cả chuỗi phiếu "nhập tiếp" (parent_id) — nguồn cho
--      trang "Chờ nhập thêm" và prefill nhập tiếp.
--   6) Whitelist inv_history += received_notes cột mới không cần — trigger
--      audit v27 tự ghi before/after mọi UPDATE.
-- Tất cả additive, không phá dữ liệu cũ. Chạy được nhiều lần (idempotent).
-- ============================================================================

-- ---------- 1. Cột mới trên received_notes ----------
alter table public.received_notes
  add column if not exists status text not null default 'completed',
  add column if not exists parent_id uuid references public.received_notes (id) on delete set null,
  add column if not exists created_by uuid,
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists reject_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'received_notes_status_check') then
    alter table public.received_notes
      add constraint received_notes_status_check
      check (status in ('pending', 'partial', 'completed', 'cancelled'));
  end if;
end $$;

create index if not exists received_notes_shop_status_idx
  on public.received_notes (shop_id, status, created_at desc);
create index if not exists received_notes_parent_idx
  on public.received_notes (parent_id);

-- ---------- 2. RLS: maker-checker ----------
alter table public.received_notes enable row level security;

drop policy if exists "shop member all" on public.received_notes;
drop policy if exists "rn member read" on public.received_notes;
drop policy if exists "rn insert pending or approver" on public.received_notes;
drop policy if exists "rn update approver" on public.received_notes;
drop policy if exists "rn member delete" on public.received_notes;

-- Đọc: mọi thành viên shop
create policy "rn member read" on public.received_notes
  for select using (public.is_shop_member(shop_id));

-- Tạo: nhân viên chỉ được tạo phiếu 'pending' (chờ duyệt);
--       chủ shop / người có quyền duyệt được tạo phiếu ghi ngay.
create policy "rn insert pending or approver" on public.received_notes
  for insert with check (
    public.is_shop_member(shop_id)
    and (
      status = 'pending'
      or public.has_permission(shop_id, 'inventory_approve')
    )
  );

-- Sửa trực tiếp: chỉ người có quyền duyệt (luồng chuẩn đi qua RPC bên dưới)
create policy "rn update approver" on public.received_notes
  for update using (public.has_permission(shop_id, 'inventory_approve'))
  with check (public.has_permission(shop_id, 'inventory_approve'));

-- Xoá: giữ hành vi cũ (thành viên shop)
create policy "rn member delete" on public.received_notes
  for delete using (public.is_shop_member(shop_id));

-- ---------- 3. RPC duyệt phiếu ----------
create or replace function public.inv_approve_note(
  p_shop uuid,
  p_note_id uuid,
  p_nonce text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note     public.received_notes%rowtype;
  v_approver text;
  v_status   text;
  v_paid     numeric;
  v_remain   numeric;
  v_txn      uuid;
begin
  if not public.has_permission(p_shop, 'inventory_approve') then
    raise exception 'Bạn không có quyền duyệt phiếu nhập.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rn_approve:' || p_note_id::text, 0));

  select * into v_note
    from public.received_notes
   where id = p_note_id and shop_id = p_shop
   for update;
  if not found then
    raise exception 'Không tìm thấy phiếu nhập.';
  end if;
  if v_note.status <> 'pending' then
    raise exception 'Phiếu không còn ở trạng thái chờ duyệt (hiện tại: %).', v_note.status;
  end if;

  -- Maker-checker: cấm tự duyệt phiếu do chính mình tạo
  if v_note.created_by is not null and v_note.created_by = auth.uid() then
    raise exception 'Không thể tự duyệt phiếu do chính mình tạo.';
  end if;

  select coalesce(full_name, auth.uid()::text) into v_approver
    from public.profiles
   where id = auth.uid();

  -- (1) Ghi tồn qua sổ cái v27 (idempotent, cùng transaction, có audit)
  perform public.inv_apply_note(p_shop, 'received_note', p_note_id, v_note.items);

  v_paid := coalesce(v_note.paid_amount, 0);

  -- (2) Ghi chi tiền ĐÃ TRẢ (chống double theo client_nonce — v24)
  if v_paid > 0 then
    if p_nonce is not null then
      select id into v_txn
        from public.transactions
       where shop_id = p_shop and client_nonce = p_nonce
       limit 1;
    end if;
    if v_txn is null then
      insert into public.transactions
        (shop_id, type, category, amount, note, occurred_at, source, client_nonce)
      values
        (p_shop, 'expense', 'Nhập hàng', v_paid,
         'Nhập hàng ' || v_note.code || coalesce(' — ' || nullif(v_note.supplier_name, ''), ''),
         now(), 'received_note', p_nonce)
      returning id into v_txn;
    end if;
  end if;

  -- (3) Công nợ NCC (AP) cho phần CHƯA TRẢ
  v_remain := coalesce(v_note.total, 0) - v_paid;
  if v_note.supplier_id is not null and v_remain > 0 then
    insert into public.supplier_debts
      (shop_id, supplier_id, received_note_id, amount, paid_amount,
       due_date, status, note, created_by)
    values
      (p_shop, v_note.supplier_id, p_note_id, v_remain, 0,
       v_note.due_date, 'open', 'Nhập hàng ' || v_note.code, v_approver);
  end if;

  -- (4) Chốt trạng thái: còn dòng nhận thiếu so với số đặt → partial
  v_status := case when exists (
    select 1
      from jsonb_array_elements(
        case when jsonb_typeof(v_note.items) = 'array' then v_note.items else '[]'::jsonb end
      ) x
     where coalesce(nullif(x->>'qty_ordered', '')::numeric, nullif(x->>'qty', '')::numeric, 0)
         > coalesce(nullif(x->>'qty', '')::numeric, 0)
  ) then 'partial' else 'completed' end;

  update public.received_notes
     set status      = v_status,
         approved_by = v_approver,
         approved_at = now()
   where id = p_note_id;

  return jsonb_build_object(
    'status',    v_status,
    'total',     v_note.total,
    'paid',      v_paid,
    'remaining', v_remain
  );
end;
$$;

-- ---------- 4. RPC từ chối phiếu ----------
create or replace function public.inv_reject_note(
  p_shop uuid,
  p_note_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.has_permission(p_shop, 'inventory_approve') then
    raise exception 'Bạn không có quyền từ chối phiếu nhập.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rn_approve:' || p_note_id::text, 0));

  update public.received_notes
     set status        = 'cancelled',
         reject_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_note_id
     and shop_id = p_shop
     and status = 'pending'
  returning status into v_status;

  if v_status is null then
    raise exception 'Phiếu không còn ở trạng thái chờ duyệt (hoặc đã được xử lý).';
  end if;

  return jsonb_build_object('status', 'cancelled');
end;
$$;

-- ---------- 5. RPC danh sách phiếu còn thiếu hàng ("Chờ nhập thêm") ----------
-- Outstanding tính NET theo CHUỖI gốc: root = phiếu không có cha; mọi phiếu
-- "nhập tiếp" (parent_id trỏ về root) được cộng dồn theo từng sản phẩm:
--   còn thiếu = Σ(số đặt) − Σ(đã nhận)   (chỉ tính phiếu đã ghi nhận hàng)
-- Nhận thừa không làm outstanding âm (clamp 0).
create or replace function public.inv_open_receive_notes(p_shop uuid)
returns table (
  root_id           uuid,
  root_code         text,
  supplier_name     text,
  supplier_id       uuid,
  created_at        timestamptz,
  outstanding_items jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._inv_assert_member(p_shop);

  return query
  with recursive chain as (
      -- Đỉnh chuỗi: phiếu không có cha
      select n.id, n.parent_id, n.id as root_id, 0 as depth
        from public.received_notes n
       where n.shop_id = p_shop
         and n.parent_id is null
      union all
      select c.id, n.parent_id, c.root_id, c.depth + 1
        from chain c
        join public.received_notes n on n.id = c.parent_id
       where c.depth < 10
         and n.shop_id = p_shop
    ),
    exploded as (
      select c.root_id,
             (x->>'product_id') as pid,
             coalesce(x->>'name', '') as pname,
             coalesce(nullif(x->>'qty_ordered', '')::numeric,
                      nullif(x->>'qty', '')::numeric) as q_ordered,
             coalesce(nullif(x->>'qty', '')::numeric, 0) as q_received,
             coalesce(nullif(x->>'cost', '')::numeric, 0) as p_cost
        from chain c
        join public.received_notes n on n.id = c.id
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(n.items) = 'array' then n.items else '[]'::jsonb end
        ) x
       where n.status in ('completed', 'partial')   -- chỉ phiếu ĐÃ ghi nhận hàng
         and coalesce(x->>'product_id', '') <> ''
    ),
    agg as (
      select e.root_id,
             e.pid,
             max(e.pname) as pname,
             sum(coalesce(e.q_ordered, e.q_received)) as q_ordered,
             sum(e.q_received) as q_received,
             max(e.p_cost) as p_cost
        from exploded e
       group by e.root_id, e.pid
    ),
    out_items as (
      select a.root_id,
             jsonb_agg(jsonb_build_object(
               'product_id',  a.pid::uuid,
               'name',        a.pname,
               'qty_ordered', a.q_ordered,
               'qty',         a.q_received,
               'outstanding', greatest(a.q_ordered - a.q_received, 0),
               'cost',        a.p_cost
             ) order by a.pname) as items
        from agg a
       where a.q_ordered - a.q_received > 0
       group by a.root_id
    )
    select rn.id, rn.code, rn.supplier_name, rn.supplier_id, rn.created_at, oi.items
      from out_items oi
      join public.received_notes rn on rn.id = oi.root_id
     order by rn.created_at desc;
end;
$$;

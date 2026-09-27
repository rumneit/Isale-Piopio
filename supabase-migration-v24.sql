-- ============================================================
-- Migration v24 — Module Thu/Chi 360° (P0–P3 audit isale-thuchi)
-- 1) transactions: contact/order/debt link + payment_type + image_urls
--    + source (nguồn gốc) + client_nonce (idempotency)
-- 2) trade_categories: danh mục thu/chi động (thay mảng cứng)
-- 3) recurring_transactions: giao dịch định kỳ
-- 4) Storage bucket 'receipts' + policies (ảnh biên lai)
-- 5) Trigger chặn sửa/xóa giao dịch có nguồn gốc (rule ISale)
-- 6) RPC transfer_money: chuyển tiền nội bộ atomic + idempotent
-- 7) RPC money_account_balances: số dư thực = initial + movements
-- Idempotent: chạy lại an toàn.
-- ============================================================

-- ---------- 1) transactions: cột mới ----------
alter table public.transactions
  add column if not exists contact_id uuid references public.customers (id) on delete set null,
  add column if not exists order_id uuid references public.orders (id) on delete set null,
  add column if not exists debt_id uuid references public.loans (id) on delete set null,
  add column if not exists payment_type text default 'CASH',
  add column if not exists image_urls jsonb default '[]'::jsonb,
  add column if not exists source text default 'manual',
  add column if not exists client_nonce text;

create index if not exists transactions_shop_occ_idx
  on public.transactions (shop_id, occurred_at desc);
create index if not exists transactions_contact_idx
  on public.transactions (contact_id) where contact_id is not null;
create index if not exists transactions_order_idx
  on public.transactions (order_id) where order_id is not null;
create index if not exists transactions_debt_idx
  on public.transactions (debt_id) where debt_id is not null;

-- idempotency: 1 nonce chỉ dùng 1 lần mỗi shop
create unique index if not exists transactions_nonce_uniq
  on public.transactions (shop_id, client_nonce)
  where client_nonce is not null;

-- tran amount hợp lý (chỉ thêm khi dữ liệu hiện có không vi phạm)
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_amount_positive'
  ) and not exists (
    select 1 from public.transactions where amount <= 0 or amount >= 1e13
  ) then
    alter table public.transactions
      add constraint transactions_amount_positive check (amount > 0 and amount < 1e13);
  end if;
end $$;

-- ---------- 2) trade_categories ----------
create table if not exists public.trade_categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  title text not null,
  type text not null check (type in ('income', 'expense')),
  order_index int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists trade_categories_shop_idx
  on public.trade_categories (shop_id, type, order_index);

drop policy if exists "shop member read" on public.trade_categories;
create policy "shop member read" on public.trade_categories
  for select using (public.is_shop_member(shop_id));
drop policy if exists "shop perm write" on public.trade_categories;
create policy "shop perm write" on public.trade_categories
  for all using (public.has_permission(shop_id, 'money'))
  with check (public.has_permission(shop_id, 'money'));

-- ---------- 3) recurring_transactions ----------
create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  title text not null,
  type text not null check (type in ('income', 'expense')),
  amount numeric(14, 2) not null check (amount > 0),
  category text,
  account_id uuid references public.money_accounts (id) on delete set null,
  payment_type text default 'CASH',
  day_of_month int not null default 1 check (day_of_month between 1 and 28),
  active boolean not null default true,
  last_run_month text,            -- 'YYYY-MM' lần cuối tạo giao dịch
  created_at timestamptz not null default now()
);
create index if not exists recurring_shop_idx
  on public.recurring_transactions (shop_id, active);

drop policy if exists "shop member read" on public.recurring_transactions;
create policy "shop member read" on public.recurring_transactions
  for select using (public.is_shop_member(shop_id));
drop policy if exists "shop perm write" on public.recurring_transactions
;
create policy "shop perm write" on public.recurring_transactions
  for all using (public.has_permission(shop_id, 'money'))
  with check (public.has_permission(shop_id, 'money'));

-- ---------- 4) Storage bucket 'receipts' ----------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

-- write: thành viên shop upload/xóa theo thư mục <shop_id>/...
drop policy if exists "receipts shop write" on storage.objects;
create policy "receipts shop write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.shops s
      where s.id = nullif((storage.foldername(name))[1], '')::uuid
        and public.is_shop_member(s.id)
    )
  );
drop policy if exists "receipts shop delete" on storage.objects;
create policy "receipts shop delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.shops s
      where s.id = nullif((storage.foldername(name))[1], '')::uuid
        and public.is_shop_member(s.id)
    )
  );

-- ---------- 5) Trigger chặn sửa/xóa giao dịch hệ thống ----------
create or replace function public.transactions_guard()
returns trigger language plpgsql as $$
begin
  if coalesce(old.source, 'manual') <> 'manual' then
    raise exception 'Giao dịch này thuộc về % nên không thể sửa/xóa thủ công. Hãy thao tác qua đối tượng gốc.',
      case old.source
        when 'order' then 'đơn hàng'
        when 'debt' then 'công nợ'
        when 'recurring' then 'giao dịch định kỳ'
        when 'transfer' then 'chuyển tiền nội bộ'
        else 'hệ thống'
      end;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists transactions_guard_trg on public.transactions;
create trigger transactions_guard_trg
  before update or delete on public.transactions
  for each row execute function public.transactions_guard();

-- ---------- 6) RPC transfer_money (atomic + idempotent) ----------
create or replace function public.transfer_money(
  p_shop uuid,
  p_from uuid,
  p_to uuid,
  p_amount numeric,
  p_fee numeric default 0,
  p_note text default null,
  p_nonce text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_bal numeric;
begin
  if p_from = p_to then
    raise exception 'Không thể chuyển tiền vào chính tài khoản đó.';
  end if;
  if not public.is_shop_member(p_shop) then
    raise exception 'Bạn không có quyền chuyển tiền cho cửa hàng này.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Số tiền chuyển cần lớn hơn 0.';
  end if;
  if p_fee is null or p_fee < 0 then
    raise exception 'Phí chuyển không hợp lệ.';
  end if;

  -- cả 2 tài khoản phải thuộc shop
  if not exists (select 1 from money_accounts where id = p_from and shop_id = p_shop)
     or not exists (select 1 from money_accounts where id = p_to and shop_id = p_shop) then
    raise exception 'Tài khoản không thuộc cửa hàng.';
  end if;

  -- khóa line để chống race (select for update trên 1 row mốc của shop)
  perform 1 from shops where id = p_shop for update;

  select coalesce(sum(case when type = 'income' then amount else -amount end), 0)
    into v_bal
    from transactions
   where shop_id = p_shop and account_id = p_from;
  -- tài khoản chưa có giao dịch: lấy số dư khai báo ban đầu
  if v_bal = 0 then
    select coalesce(balance, 0) into v_bal from money_accounts where id = p_from;
  end if;

  if v_bal < p_amount + p_fee then
    raise exception 'Số dư tài khoản nguồn không đủ (hiện có %).', to_char(v_bal, 'FM999999999999');
  end if;

  -- idempotent: replay cùng nonce -> unique_violation -> bỏ qua (atomic statement)
  begin
    insert into transactions
      (shop_id, type, category, amount, account_id, note, occurred_at, source, payment_type, client_nonce)
    values
      (p_shop, 'expense', 'Chuyển tiền nội bộ', p_amount + p_fee, p_from,
        coalesce(p_note, 'Chuyển tiền nội bộ'), now(), 'transfer', 'INTERNAL', p_nonce),
      (p_shop, 'income',  'Chuyển tiền nội bộ', p_amount, p_to,
        coalesce(p_note, 'Nhận tiền nội bộ'), now(), 'transfer', 'INTERNAL',
        case when p_nonce is not null then p_nonce || '-in' else null end);
  exception when unique_violation then null;
  end;
end $$;

-- ---------- 7) RPC money_account_balances ----------
create or replace function public.money_account_balances(p_shop uuid)
returns table (account_id uuid, total numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_shop_member(p_shop) then
    raise exception 'Bạn không có quyền xem cửa hàng này.';
  end if;
  return query
  select a.id,
         a.balance
         + coalesce(sum(case when t.type = 'income' then t.amount else -t.amount end), 0) as total
    from money_accounts a
    left join transactions t
      on t.account_id = a.id and t.shop_id = p_shop
   where a.shop_id = p_shop
   group by a.id, a.balance;
end $$;

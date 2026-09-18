-- =============================================================
-- ISale — Migration v4: Loyalty points (tích điểm khách hàng)
-- Chạy trong Supabase Dashboard → SQL Editor → New query
-- =============================================================

-- Cột điểm trên khách hàng
alter table public.customers
  add column if not exists points numeric(14, 2) not null default 0;

-- Lịch sử điểm
create table if not exists public.point_transactions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  type text not null check (type in ('earn', 'redeem', 'adjust')),
  points numeric(14, 2) not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists point_transactions_shop_idx
  on public.point_transactions (shop_id, customer_id, created_at desc);

drop policy if exists "shop member all" on public.point_transactions;
create policy "shop member all" on public.point_transactions
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

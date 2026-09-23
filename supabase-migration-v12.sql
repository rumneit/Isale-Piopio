-- =============================================================
-- PioPio — Migration v12: Kiểm kê kho (cycle count) + RBAC cấp DB
-- Chạy trong Supabase Dashboard → SQL Editor → New query
-- =============================================================

-- ---------- 1. Phiếu kiểm kê kho ----------
create table if not exists public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  code text not null,
  status text not null default 'draft' check (status in ('draft', 'completed', 'cancelled')),
  items jsonb not null default '[]'::jsonb,
  total_diff numeric(14, 2) not null default 0,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists stock_counts_shop_idx on public.stock_counts (shop_id, created_at desc);

drop policy if exists "shop member all" on public.stock_counts;
create policy "shop member all" on public.stock_counts
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

-- ---------- 2. Helper RBAC: nhân viên có quyền X không? ----------
-- owner luôn true; nhân viên đọc cờ trong profiles.permissions.
create or replace function public.has_permission(shop uuid, perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and shop_id = shop
      and (
        role = 'owner'
        or coalesce((permissions ->> perm)::boolean, false)
      )
  ) or exists (
    select 1 from public.shops
    where id = shop and owner_id = auth.uid()
  );
$$;

-- ---------- 3. Siết RLS cho nghiệp vụ kho/tiền/báo cáo ----------
-- Nhân viên chỉ ghi được vào bảng thuộc quyền họ được cấp.
-- (Đọc vẫn cho phép toàn shop để không vỡ luồng tra cứu hiện có.)

-- Kho & sản phẩm
drop policy if exists "shop member all" on public.products;
create policy "shop member read" on public.products
  for select using (public.is_shop_member(shop_id));
create policy "shop perm write" on public.products
  for all using (public.has_permission(shop_id, 'inventory'))
  with check (public.has_permission(shop_id, 'inventory'));

drop policy if exists "shop member all" on public.categories;
create policy "shop member read" on public.categories
  for select using (public.is_shop_member(shop_id));
create policy "shop perm write" on public.categories
  for all using (public.has_permission(shop_id, 'inventory'))
  with check (public.has_permission(shop_id, 'inventory'));

drop policy if exists "shop member all" on public.stock_counts;
create policy "shop member read" on public.stock_counts
  for select using (public.is_shop_member(shop_id));
create policy "shop perm write" on public.stock_counts
  for all using (public.has_permission(shop_id, 'inventory'))
  with check (public.has_permission(shop_id, 'inventory'));

-- Thu chi & sổ tiền
drop policy if exists "shop member all" on public.transactions;
create policy "shop member read" on public.transactions
  for select using (public.is_shop_member(shop_id));
create policy "shop perm write" on public.transactions
  for all using (public.has_permission(shop_id, 'money'))
  with check (public.has_permission(shop_id, 'money'));

drop policy if exists "shop member all" on public.money_accounts;
create policy "shop member read" on public.money_accounts
  for select using (public.is_shop_member(shop_id));
create policy "shop perm write" on public.money_accounts
  for all using (public.has_permission(shop_id, 'money'))
  with check (public.has_permission(shop_id, 'money'));

-- CRM & khách hàng
drop policy if exists "shop member all" on public.customers;
create policy "shop member read" on public.customers
  for select using (public.is_shop_member(shop_id));
create policy "shop perm write" on public.customers
  for all using (public.has_permission(shop_id, 'crm'))
  with check (public.has_permission(shop_id, 'crm'));

-- =============================================================
-- Ghi chú: chạy file này SAU khi đã cấp quyền cho nhân viên ở trang
-- "Phân quyền". Chủ cửa hàng luôn toàn quyền nên không bị ảnh hưởng.
-- =============================================================

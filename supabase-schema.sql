-- =============================================================
-- ISale — Supabase schema (v1)
-- Chạy file này trong Supabase Dashboard → SQL Editor → New query
-- =============================================================

create extension if not exists "pgcrypto";

-- ---------- Shops ----------
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- Profiles (mỗi user là 1 dòng) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  shop_id uuid references public.shops (id) on delete set null,
  full_name text,
  role text not null default 'staff',
  created_at timestamptz not null default now()
);

-- ---------- Categories ----------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- ---------- Products ----------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  sku text,
  unit text,
  price numeric(14, 2) not null default 0,
  cost numeric(14, 2),
  stock numeric(14, 2) not null default 0,
  category_id uuid references public.categories (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists products_shop_idx on public.products (shop_id);

-- ---------- Customers ----------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  debt numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists customers_shop_idx on public.customers (shop_id);

-- ---------- Money accounts ----------
create table if not exists public.money_accounts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  type text not null default 'cash',
  balance numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists money_accounts_shop_idx on public.money_accounts (shop_id);

-- ---------- Orders ----------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  code text not null,
  customer_id uuid references public.customers (id) on delete set null,
  customer_name text,
  status text not null default 'completed',
  total numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  paid boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists orders_shop_idx on public.orders (shop_id, created_at desc);

-- ---------- Order items ----------
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  name text not null,
  price numeric(14, 2) not null default 0,
  qty numeric(14, 2) not null default 1,
  total numeric(14, 2) not null default 0
);
create index if not exists order_items_order_idx on public.order_items (order_id);

-- ---------- Transactions (thu / chi) ----------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  category text,
  amount numeric(14, 2) not null default 0,
  account_id uuid references public.money_accounts (id) on delete set null,
  note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists transactions_shop_idx on public.transactions (shop_id, occurred_at desc);

-- =============================================================
-- Helper: user hiện tại có thuộc shop không?
-- =============================================================
create or replace function public.is_shop_member(shop uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and shop_id = shop
  ) or exists (
    select 1 from public.shops
    where id = shop and owner_id = auth.uid()
  );
$$;

-- =============================================================
-- Row Level Security
-- =============================================================
alter table public.shops enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.money_accounts enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.transactions enable row level security;

-- shops: chủ shop full quyền; member chỉ đọc
drop policy if exists "shop owner full access" on public.shops;
create policy "shop owner full access" on public.shops
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "shop member read" on public.shops;
create policy "shop member read" on public.shops
  for select using (public.is_shop_member(id));

-- profiles: user đọc/sửa profile của mình; đọc profile cùng shop
drop policy if exists "profile self" on public.profiles;
create policy "profile self" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profile same shop read" on public.profiles;
create policy "profile same shop read" on public.profiles
  for select using (
    shop_id is not null and public.is_shop_member(shop_id)
  );

-- Bảng dữ liệu theo shop: member của shop full quyền
do $$
declare t text;
begin
  foreach t in array array[
    'categories', 'products', 'customers', 'money_accounts',
    'orders', 'transactions'
  ]
  loop
    execute format('drop policy if exists "shop member all" on public.%I', t);
    execute format(
      'create policy "shop member all" on public.%I for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id))',
      t
    );
  end loop;
end $$;

-- order_items: theo order → shop
drop policy if exists "shop member all" on public.order_items;
create policy "shop member all" on public.order_items
  for all using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and public.is_shop_member(o.shop_id)
    )
  ) with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and public.is_shop_member(o.shop_id)
    )
  );

-- =============================================================
-- Trigger: tự tạo profile khi user đăng ký
-- =============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'owner'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

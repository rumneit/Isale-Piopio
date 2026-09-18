-- =============================================================
-- ISale — Migration v3: Promotions (khuyến mãi) + Materials (nguyên liệu)
-- Chạy trong Supabase Dashboard → SQL Editor → New query
-- =============================================================

-- ---------- Promotions ----------
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  type text not null default 'percent' check (type in ('percent', 'fixed')),
  value numeric(14, 2) not null default 0,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists promotions_shop_idx on public.promotions (shop_id);

drop policy if exists "shop member all" on public.promotions;
create policy "shop member all" on public.promotions
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

-- ---------- Materials (nguyên liệu) ----------
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  unit text,
  stock numeric(14, 2) not null default 0,
  cost numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists materials_shop_idx on public.materials (shop_id);

drop policy if exists "shop member all" on public.materials;
create policy "shop member all" on public.materials
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

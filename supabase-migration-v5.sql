-- =============================================================
-- ISale — Migration v5: Settings (cấu hình vận hành theo shop)
-- Chạy trong Supabase Dashboard → SQL Editor → New query
-- =============================================================

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  unique (shop_id, key)
);

drop policy if exists "shop member all" on public.settings;
create policy "shop member all" on public.settings
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

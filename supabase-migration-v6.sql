-- =============================================================
-- ISale — Migration v6: Return notes (phiếu trả hàng)
-- Chạy trong Supabase Dashboard → SQL Editor → New query
-- =============================================================

create table if not exists public.return_notes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  order_code text,
  code text not null,
  customer_id uuid references public.customers (id) on delete set null,
  items jsonb not null default '[]'::jsonb,
  total numeric(14, 2) not null default 0,
  refunded boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists return_notes_shop_idx on public.return_notes (shop_id, created_at desc);

drop policy if exists "shop member all" on public.return_notes;
create policy "shop member all" on public.return_notes
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

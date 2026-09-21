-- =============================================================
-- PioPio — Migration v11: Sổ Vay/Nợ (loans)
-- Chạy trong Supabase Dashboard → SQL Editor → New query
-- =============================================================

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  type text not null default 'loan' check (type in ('loan', 'debt')),
  party_name text not null,
  amount numeric(14, 2) not null default 0,
  paid boolean not null default false,
  note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists loans_shop_idx on public.loans (shop_id, occurred_at desc);

drop policy if exists "shop member all" on public.loans;
create policy "shop member all" on public.loans
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

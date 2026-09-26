-- =============================================================
-- ISale — Migration v2: CRM leads + Received notes (nhập hàng)
-- Chạy trong Supabase Dashboard → SQL Editor → New query
-- =============================================================

-- ---------- CRM Leads ----------
create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  source text,
  stage text not null default 'new'
    check (stage in ('new', 'contacting', 'quoted', 'won', 'lost')),
  value numeric(14, 2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists crm_leads_shop_idx on public.crm_leads (shop_id, stage);

drop policy if exists "shop member all" on public.crm_leads;
create policy "shop member all" on public.crm_leads
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

-- ---------- Received notes (phiếu nhập hàng) ----------
create table if not exists public.received_notes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  code text not null,
  supplier_name text,
  total numeric(14, 2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  paid boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists received_notes_shop_idx on public.received_notes (shop_id, created_at desc);

drop policy if exists "shop member all" on public.received_notes;
create policy "shop member all" on public.received_notes
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

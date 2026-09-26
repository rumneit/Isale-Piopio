-- =============================================================
-- PioPio — Migration v7: Calendar, Notes, Shifts, Transfers,
--                         CRM activities, Cafe tables, Tickets, Surveys
-- Chạy trong Supabase Dashboard → SQL Editor → New query
-- =============================================================

-- ---------- Calendar events ----------
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  title text not null,
  details text,
  event_date date not null,
  color text not null default 'primary',
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists calendar_events_shop_idx on public.calendar_events (shop_id, event_date);
drop policy if exists "shop member all" on public.calendar_events;
create policy "shop member all" on public.calendar_events
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

-- ---------- Notes ----------
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  title text not null,
  content text,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notes_shop_idx on public.notes (shop_id, created_at desc);
drop policy if exists "shop member all" on public.notes;
create policy "shop member all" on public.notes
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

-- ---------- Shifts (ca làm việc) ----------
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  staff_name text not null default '',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_note text,
  closing_note text
);
create index if not exists shifts_shop_idx on public.shifts (shop_id, opened_at desc);
drop policy if exists "shop member all" on public.shifts;
create policy "shop member all" on public.shifts
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

-- ---------- Transfers (phiếu xuất/chuyển hàng đi) ----------
create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  code text not null,
  destination text,
  items jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists transfers_shop_idx on public.transfers (shop_id, created_at desc);
drop policy if exists "shop member all" on public.transfers;
create policy "shop member all" on public.transfers
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

-- ---------- CRM activities ----------
create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  lead_id uuid references public.crm_leads (id) on delete cascade,
  type text not null default 'call' check (type in ('call', 'meeting', 'note', 'email', 'zalo')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists crm_activities_shop_idx on public.crm_activities (shop_id, created_at desc);
drop policy if exists "shop member all" on public.crm_activities;
create policy "shop member all" on public.crm_activities
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

-- ---------- Cafe tables ----------
create table if not exists public.cafe_tables (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  seats int not null default 4,
  status text not null default 'free' check (status in ('free', 'busy', 'reserved')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists cafe_tables_shop_idx on public.cafe_tables (shop_id);
drop policy if exists "shop member all" on public.cafe_tables;
create policy "shop member all" on public.cafe_tables
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

-- ---------- Tickets (hỗ trợ) ----------
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  subject text not null,
  content text,
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists tickets_shop_idx on public.tickets (shop_id, created_at desc);
drop policy if exists "shop member all" on public.tickets;
create policy "shop member all" on public.tickets
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

-- ---------- Surveys (đánh giá app) ----------
create table if not exists public.surveys (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);
create index if not exists surveys_shop_idx on public.surveys (shop_id, created_at desc);
drop policy if exists "shop member all" on public.surveys;
create policy "shop member all" on public.surveys
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

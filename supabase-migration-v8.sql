-- =============================================================
-- PioPio — Migration v8: Activity logs + Staff permissions
-- Chạy trong Supabase Dashboard → SQL Editor → New query
-- =============================================================

-- ---------- Lịch sử thay đổi ----------
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  user_name text not null default '',
  action text not null check (action in ('create', 'update', 'delete')),
  entity text not null,
  entity_label text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists activity_logs_shop_idx on public.activity_logs (shop_id, created_at desc);
drop policy if exists "shop member all" on public.activity_logs;
create policy "shop member all" on public.activity_logs
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

-- ---------- Quyền nhân viên (jsonb trên profiles) ----------
alter table public.profiles
  add column if not exists permissions jsonb not null default '{}'::jsonb;

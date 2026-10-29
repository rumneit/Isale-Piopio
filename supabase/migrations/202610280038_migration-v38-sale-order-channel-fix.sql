-- =============================================================
-- PioPio — Migration v38: Fix lỗi lưu đơn bán hàng
--
-- Triệu chứng:
--   POST /rest/v1/rpc/inv_create_order → 400
--   column "channel_id" of relation "orders" does not exist
--
-- Nguyên nhân:
--   Database chưa chạy phần "Kênh bán hàng" của migration v13,
--   nên thiếu bảng public.sales_channels và cột public.orders.channel_id
--   trong khi function inv_create_order (v34) đã tham chiếu cột này.
--
-- Cách chạy:
--   Supabase Dashboard → SQL Editor → New query → dán toàn bộ file → Run.
--   An toàn để chạy lại nhiều lần (idempotent).
-- =============================================================

-- ---------- 1. Bảng kênh bán hàng ----------
create table if not exists public.sales_channels (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  type text not null default 'direct' check (type in ('direct', 'online', 'marketplace', 'agent', 'other')),
  fee_percent numeric(6, 2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists sales_channels_shop_idx
  on public.sales_channels (shop_id, created_at desc);

-- ---------- 2. Cột orders.channel_id (nguyên nhân lỗi) ----------
alter table public.orders
  add column if not exists channel_id uuid references public.sales_channels (id) on delete set null;

-- ---------- 3. RLS cho bảng mới ----------
alter table public.sales_channels enable row level security;

drop policy if exists "shop member read" on public.sales_channels;
create policy "shop member read" on public.sales_channels
  for select using (public.is_shop_member(shop_id));

drop policy if exists "shop perm write" on public.sales_channels;
create policy "shop perm write" on public.sales_channels
  for all using (public.has_permission(shop_id, 'sell'))
  with check (public.has_permission(shop_id, 'sell'));

-- ---------- 4. Nạp lại schema cache của PostgREST ----------
notify pgrst, 'reload schema';

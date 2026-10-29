-- =============================================================
-- PioPio — Migration v10: thông tin shop đầy đủ (khớp trang Cấu hình)
-- Chạy trong Supabase Dashboard → SQL Editor → New query
-- =============================================================

alter table public.shops
  add column if not exists description text;
alter table public.shops
  add column if not exists phone text;
alter table public.shops
  add column if not exists address text;
alter table public.shops
  add column if not exists website text;
alter table public.shops
  add column if not exists logo_url text;
alter table public.shops
  add column if not exists bank_name text;
alter table public.shops
  add column if not exists bank_owner text;
alter table public.shops
  add column if not exists bank_account text;

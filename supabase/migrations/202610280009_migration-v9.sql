-- =============================================================
-- PioPio — Migration v9: trường mới để khớp UI ISale
-- Chạy trong Supabase Dashboard → SQL Editor → New query
-- =============================================================

-- Sản phẩm: quản lý Serial/IMEI
alter table public.products
  add column if not exists serial_managed boolean not null default false;

-- Khách hàng: giới tính, đánh dấu quan trọng, hoạt động cuối
alter table public.customers
  add column if not exists gender text;
alter table public.customers
  add column if not exists important boolean not null default false;
alter table public.customers
  add column if not exists last_activity timestamptz;

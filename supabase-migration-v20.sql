-- ============================================================
-- Migration v20 — Chi tiết sản phẩm đồng bộ UI ISale live (09/2026)
-- Bổ sung cờ hiển thị, mô tả, giá theo khách/CTV, nhiều mã vạch,
-- trường tùy chỉnh. IDEMPOTENT: chạy lại nhiều lần cũng không lỗi.
-- Chạy sau (hoặc độc lập với) v18/v19.
-- ============================================================

alter table public.products
  add column if not exists dich_vu        boolean default false,
  add column if not exists ngoai_te       boolean default false,
  add column if not exists gia_nhap_nt    numeric,
  add column if not exists hien_tren_web  boolean default true,
  add column if not exists ban_chay       boolean default false,
  add column if not exists moi            boolean default false,
  add column if not exists hien_gia_web   boolean default false,
  add column if not exists khuyen_mai     boolean default false,
  add column if not exists mo_ta          text,
  add column if not exists price_settings jsonb default '[]'::jsonb,
  add column if not exists barcodes       jsonb default '[]'::jsonb,
  add column if not exists custom_fields  jsonb default '[]'::jsonb;

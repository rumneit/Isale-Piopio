-- ============================================================
-- Migration v21 — Trang SỬA SẢN PHẨM đồng bộ UI ISale live (09/2026)
-- Là sản phẩm combo / Tự trừ nguyên vật liệu / Mã tiền tệ ngoại tệ.
-- IDEMPOTENT: chạy lại nhiều lần cũng không lỗi.
-- ============================================================

alter table public.products
  add column if not exists la_combo         boolean default false,
  add column if not exists tu_tru_nvl       boolean default false,
  add column if not exists ngoai_te_tien_te text;

-- ============================================================================
-- PioPio v16 — Hạn sử dụng + mã vạch sản phẩm (additive)
--
-- File gốc của migration này bị thiếu trong repository. Nội dung dưới đây được
-- khôi phục từ các cột mà frontend đang feature-detect và từ production:
--   products.expiry_date, products.barcode
--
-- An toàn khi chạy lại nhiều lần.
-- ============================================================================

alter table public.products add column if not exists expiry_date date;
alter table public.products add column if not exists barcode text;

-- Tra cứu nhanh theo mã vạch trong từng cửa hàng.
create index if not exists products_shop_barcode_idx
  on public.products (shop_id, barcode)
  where barcode is not null;

-- Hỗ trợ màn hình/lọc "Còn hạn sử dụng".
create index if not exists products_shop_expiry_idx
  on public.products (shop_id, expiry_date)
  where expiry_date is not null;

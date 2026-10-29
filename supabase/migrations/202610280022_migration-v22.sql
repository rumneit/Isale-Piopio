-- =============================================================
-- PioPio - Migration v22: Bán hàng đồng bộ ISale live (09/2026)
--   Thanh toán: phí ship + ai trả ship, thuế/tổng đã có trên UI
--   Khách hàng: SĐT + địa chỉ khách trên đơn
--   Vận chuyển: mã vận đơn, đơn vị VC, shipper, nơi nhận
--   QR VietQR : shops.bank_code (mã ngân hàng VietQR, VD: 'mb')
-- ADDITIVE + IDEMPOTENT: chạy lại nhiều lần không lỗi, không mất dữ liệu.
-- Chạy trong Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- ---------- 1. orders: thanh toán & vận chuyển ----------
alter table public.orders
  add column if not exists ship_fee numeric(14, 2) not null default 0;
alter table public.orders
  add column if not exists ship_fee_by_customer boolean not null default true;
alter table public.orders
  add column if not exists customer_phone text;
alter table public.orders
  add column if not exists customer_address text;
alter table public.orders
  add column if not exists shipping_code text;
alter table public.orders
  add column if not exists shipping_partner text;
alter table public.orders
  add column if not exists shipper_name text;
alter table public.orders
  add column if not exists shipper_phone text;
alter table public.orders
  add column if not exists shipping_address text;

-- ---------- 2. shops: mã ngân hàng cho QR VietQR ----------
alter table public.shops
  add column if not exists bank_code text;

-- Ghi chú:
--  - shops.bank_name / bank_owner / bank_account đã có từ v10.
--  - UI tự dò cột trước khi ghi (detectOrderExtras) nên app vẫn chạy
--    được cả khi migration chưa chạy xong.
--  - payment_method (v17, additive) vẫn được app dò riêng.

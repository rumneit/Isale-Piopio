-- =============================================================
-- Migration v19 — Các tab mở rộng trong Chi tiết sản phẩm (kiểu ISale)
-- Thêm cột (additive, idempotent — chạy lại an toàn):
--   units      : Đơn vị khác (quy đổi)      [{name, conversion, price, cost}]
--   images     : Thư viện ảnh (bộ sưu tập)  [url, ...]
--   price_wholesale : Giá bán buôn (khách sỉ)
--   price_ctv       : Giá CTV (cộng tác viên)
--   discounts  : Chiết khấu theo số lượng   [{min_qty, percent}]
--   options    : Options (tùy chọn)         [{name, values:[...]}]
--   tags       : Thẻ phân loại              ["chuỗi", ...]
-- Chính sách RLS của bảng products đã phủ (theo shop_id) — không cần policy mới.
-- =============================================================

alter table public.products add column if not exists units jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists images jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists price_wholesale numeric(14,2);
alter table public.products add column if not exists price_ctv numeric(14,2);
alter table public.products add column if not exists discounts jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists options jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists tags jsonb not null default '[]'::jsonb;

comment on column public.products.units is 'ISale tab "Đơn vị khác": đơn vị quy đổi [{name, conversion, price, cost}]';
comment on column public.products.images is 'ISale tab "Ảnh": thư viện ảnh [url, ...] (ngoài ảnh đại diện products.image)';
comment on column public.products.price_wholesale is 'ISale tab "Giá khách & CTV": giá bán buôn';
comment on column public.products.price_ctv is 'ISale tab "Giá khách & CTV": giá cộng tác viên';
comment on column public.products.discounts is 'ISale tab "Chiết khấu": bậc giảm giá theo số lượng [{min_qty, percent}]';
comment on column public.products.options is 'ISale tab "Options": tùy chọn [{name, values}]';
comment on column public.products.tags is 'ISale tab "Phân loại": thẻ ["...", ...]';

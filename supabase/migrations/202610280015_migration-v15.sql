-- =============================================================
-- PioPio — Migration v15: Cột phục vụ import dữ liệu thật (sp.xlsx / kh.xlsx)
--  - products:  vat_rate, attributes (jsonb), metadata (jsonb)
--  - customers: code, tax_code, customer_type, contact_person, metadata (jsonb)
--  - Unique partial index chống trùng SKU / mã khách hàng
-- Chỉ ADD COLUMN / CREATE INDEX — không sửa, không xoá dữ liệu cũ.
-- Chạy trong Supabase Dashboard → SQL Editor → New query
-- =============================================================

alter table public.products   add column if not exists vat_rate numeric(5, 2);
alter table public.products   add column if not exists attributes jsonb not null default '{}'::jsonb;
alter table public.products   add column if not exists metadata    jsonb not null default '{}'::jsonb;

alter table public.customers  add column if not exists code text;
alter table public.customers  add column if not exists tax_code text;
alter table public.customers  add column if not exists customer_type text;
alter table public.customers  add column if not exists contact_person text;
alter table public.customers  add column if not exists metadata    jsonb not null default '{}'::jsonb;

-- SKU là định danh mạnh: chặn trùng trong cùng 1 shop (NULL được phép)
create unique index if not exists products_shop_sku_uidx
  on public.products (shop_id, sku) where sku is not null;

-- Mã khách hàng: chặn trùng trong cùng 1 shop (56/90 KH không có mã → NULL được phép)
create unique index if not exists customers_shop_code_uidx
  on public.customers (shop_id, code) where code is not null;

-- Index phục vụ tìm kiếm / đối chiếu
create index if not exists customers_shop_tax_idx on public.customers (shop_id, tax_code);
create index if not exists products_shop_vat_idx  on public.products (shop_id, vat_rate);

-- Ghi chú: RLS của bảng products/customers đã có sẵn (v1/v12) — áp dụng cả cột mới,
-- không cần policy thêm.

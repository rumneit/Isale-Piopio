-- =============================================================
-- PioPio — Migration v18: Ảnh sản phẩm (grid bán hàng có ảnh)
--  - products: cột image (URL ảnh đại diện)
--  - Storage bucket "products" (đọc public, ghi khi đã đăng nhập)
-- Chỉ ADD COLUMN / tạo bucket + policy — không sửa, không xoá dữ liệu cũ.
-- Chạy trong Supabase Dashboard → SQL Editor → New query
-- =============================================================

alter table public.products add column if not exists image text;

-- Bucket lưu ảnh sản phẩm (public read)
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do nothing;

-- Policy storage cho bucket "products" (idempotent)
drop policy if exists "products bucket select" on storage.objects;
create policy "products bucket select" on storage.objects
  for select using (bucket_id = 'products');

drop policy if exists "products bucket insert" on storage.objects;
create policy "products bucket insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'products');

drop policy if exists "products bucket update" on storage.objects;
create policy "products bucket update" on storage.objects
  for update to authenticated using (bucket_id = 'products');

drop policy if exists "products bucket delete" on storage.objects;
create policy "products bucket delete" on storage.objects
  for delete to authenticated using (bucket_id = 'products');

-- Ghi chú: cột image áp dụng RLS sẵn có của bảng products — không cần policy thêm.

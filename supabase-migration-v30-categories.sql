-- =============================================================
-- PioPio — Migration v30: củng cố Danh mục sản phẩm
-- Chạy thủ công trong Supabase Dashboard → SQL Editor.
-- File idempotent: có thể chạy lại an toàn.
-- =============================================================

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists categories_shop_name_idx
  on public.categories (shop_id, lower(name));

alter table public.categories enable row level security;

-- NOT VALID không làm migration thất bại nếu dữ liệu cũ đang có tên rỗng,
-- nhưng vẫn chặn bản ghi rỗng mới. Sau khi dọn dữ liệu cũ có thể chạy:
-- alter table public.categories validate constraint categories_name_not_blank;
alter table public.categories
  drop constraint if exists categories_name_not_blank;
alter table public.categories
  add constraint categories_name_not_blank
  check (length(btrim(name)) > 0) not valid;

-- Quyền đọc cho thành viên cùng shop; quyền ghi theo permission inventory.
-- Hai helper is_shop_member/has_permission đã có trong schema + migration v12.
drop policy if exists "shop member all" on public.categories;
drop policy if exists "shop member read" on public.categories;
drop policy if exists "shop perm write" on public.categories;

create policy "shop member read" on public.categories
  for select using (public.is_shop_member(shop_id));

create policy "shop perm write" on public.categories
  for all using (public.has_permission(shop_id, 'inventory'))
  with check (public.has_permission(shop_id, 'inventory'));

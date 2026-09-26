-- =============================================================
-- PioPio — Migration v14: Các module còn lại sau audit (đợt 3)
--   Đối tác vận chuyển, Cấu hình tích điểm, Cấu hình thăng hạng,
--   Trang động do AI tạo, Kết nối thuế (hồ sơ + tờ khai).
-- Chạy trong Supabase Dashboard → SQL Editor → New query
-- =============================================================

-- ---------- 1. Đối tác vận chuyển (shipping partners) ----------
create table if not exists public.shipping_partners (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  code text,                                   -- mã đối tác: ghn, ghtk, viettelpost...
  phone text,
  api_endpoint text,
  api_token text,
  fee_percent numeric(6, 2) not null default 0,
  active boolean not null default true,
  is_default boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists shipping_partners_shop_idx on public.shipping_partners (shop_id, created_at desc);

-- ---------- 2. Cấu hình tích điểm ----------
-- Mỗi dòng là một quy tắc tích điểm áp dụng cho một hạng khách.
create table if not exists public.point_configs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  tier text not null default 'all' check (tier in ('all', 'bronze', 'silver', 'gold', 'platinum')),
  spend_per_point numeric(14, 2) not null default 10000,   -- bao nhiêu ₫ = 1 điểm
  redeem_value numeric(14, 2) not null default 1000,       -- 1 điểm đổi được bao nhiêu ₫
  min_order_total numeric(14, 2) not null default 0,       -- đơn tối thiểu mới được tích
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists point_configs_shop_idx on public.point_configs (shop_id, created_at desc);

-- ---------- 3. Cấu hình thăng hạng khách hàng (loyalty tiers) ----------
create table if not exists public.loyalty_tiers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  tier text not null default 'bronze',
  min_spend numeric(14, 2) not null default 0,             -- tổng chi tiêu tối thiểu để đạt hạng
  min_points integer not null default 0,                    -- điểm tối thiểu
  discount_percent numeric(6, 2) not null default 0,        -- chiết khấu mặc định cho hạng
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists loyalty_tiers_shop_idx on public.loyalty_tiers (shop_id, sort_order);

-- Hạng hiện tại của khách (tính từ cấu hình thăng hạng)
alter table public.customers
  add column if not exists tier text;

-- ---------- 4. Trang động do AI tạo (ai dynamic pages) ----------
create table if not exists public.ai_pages (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  prompt text,                                 -- mô tả tự nhiên của người dùng
  config jsonb not null default '{}'::jsonb,   -- { kpis:[], charts:[], table:{} }
  created_at timestamptz not null default now()
);
create index if not exists ai_pages_shop_idx on public.ai_pages (shop_id, created_at desc);

-- ---------- 5. Hồ sơ thuế CyberLotus (tax profiles) ----------
create table if not exists public.tax_profiles (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  tax_code text not null,                      -- mã số thuế
  company_name text not null,
  address text,
  legal_rep text,                              -- người đại diện pháp luật
  phone text,
  email text,
  accounting_period text,                      -- kỳ kê khai: 'YYYY-MM'
  invoice_form text,                           -- mẫu hóa đơn, vd '01GTKT0/001'
  declaration_type text,                       -- tờ khai: '01/GTGT', '02/GTGT'...
  status text not null default 'draft' check (status in ('draft', 'ready', 'submitted')),
  created_at timestamptz not null default now()
);
create index if not exists tax_profiles_shop_idx on public.tax_profiles (shop_id, created_at desc);

-- ---------- 6. Tờ khai thuế (tax declarations / HTKK) ----------
create table if not exists public.tax_declarations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  profile_id uuid references public.tax_profiles (id) on delete set null,
  period text not null,                        -- 'YYYY-MM'
  declaration_type text not null default '01/GTGT',
  revenue numeric(14, 2) not null default 0,
  vat_amount numeric(14, 2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'ready', 'submitted')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists tax_declarations_shop_idx on public.tax_declarations (shop_id, period desc);

-- =============================================================
-- RLS: đọc cho thành viên shop; ghi theo quyền tương ứng.
-- =============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'shipping_partners', 'point_configs', 'loyalty_tiers',
    'ai_pages', 'tax_profiles', 'tax_declarations'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "shop member read" on public.%I', t);
    execute format(
      'create policy "shop member read" on public.%I for select using (public.is_shop_member(shop_id))', t);
  end loop;
end $$;

-- Vận chuyển: ghi theo quyền bán hàng
drop policy if exists "shop perm write" on public.shipping_partners;
create policy "shop perm write" on public.shipping_partners
  for all using (public.has_permission(shop_id, 'sell'))
  with check (public.has_permission(shop_id, 'sell'));

-- Tích điểm & thăng hạng: thuộc CRM
drop policy if exists "shop perm write" on public.point_configs;
create policy "shop perm write" on public.point_configs
  for all using (public.has_permission(shop_id, 'crm'))
  with check (public.has_permission(shop_id, 'crm'));

drop policy if exists "shop perm write" on public.loyalty_tiers;
create policy "shop perm write" on public.loyalty_tiers
  for all using (public.has_permission(shop_id, 'crm'))
  with check (public.has_permission(shop_id, 'crm'));

-- Trang AI: thuộc báo cáo
drop policy if exists "shop perm write" on public.ai_pages;
create policy "shop perm write" on public.ai_pages
  for all using (public.has_permission(shop_id, 'report'))
  with check (public.has_permission(shop_id, 'report'));

-- Thuế: thuộc quyền tiền/kế toán
drop policy if exists "shop perm write" on public.tax_profiles;
create policy "shop perm write" on public.tax_profiles
  for all using (public.has_permission(shop_id, 'money'))
  with check (public.has_permission(shop_id, 'money'));

drop policy if exists "shop perm write" on public.tax_declarations;
create policy "shop perm write" on public.tax_declarations
  for all using (public.has_permission(shop_id, 'money'))
  with check (public.has_permission(shop_id, 'money'));

-- =============================================================
-- Ghi chú trung thực:
--  - Kết nối CyberLotus/HTKK: module này LƯU hồ sơ thuế và tổng hợp số liệu
--    để xuất tờ khai. Việc nộp lên cơ quan thuế qua API CyberLotus cần tài
--    khoản đối tác + backend giữ khoá bí mật (ngoài phạm vi frontend).
--  - Trang AI: lưu cấu hình trang. Việc sinh cấu hình từ câu chat cần gọi
--    mô hình AI qua backend giữ API key (không nhúng khoá vào frontend).
-- =============================================================

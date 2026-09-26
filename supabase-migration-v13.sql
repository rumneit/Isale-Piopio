-- =============================================================
-- PioPio — Migration v13: Các module còn thiếu sau audit
--   Tuyến bán hàng, Kênh bán hàng, CRM nâng cao, Trường/Bảng tùy chỉnh,
--   Cấu hình tích hợp, API token ngoài.
-- Chạy trong Supabase Dashboard → SQL Editor → New query
-- =============================================================

-- ---------- 1. Tuyến bán hàng (sales routes) ----------
create table if not exists public.sales_routes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  description text,
  color text default '#6030ff',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists sales_routes_shop_idx on public.sales_routes (shop_id, created_at desc);

-- Gán khách hàng vào tuyến
alter table public.customers
  add column if not exists route_id uuid references public.sales_routes (id) on delete set null;

-- ---------- 2. Kênh bán hàng (sales channels) ----------
create table if not exists public.sales_channels (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  type text not null default 'direct' check (type in ('direct', 'online', 'marketplace', 'agent', 'other')),
  fee_percent numeric(6, 2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists sales_channels_shop_idx on public.sales_channels (shop_id, created_at desc);

alter table public.orders
  add column if not exists channel_id uuid references public.sales_channels (id) on delete set null;

-- ---------- 3. CRM: Cơ hội bán hàng (deals) ----------
create table if not exists public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  title text not null,
  customer_id uuid references public.customers (id) on delete set null,
  lead_id uuid references public.crm_leads (id) on delete set null,
  amount numeric(14, 2) not null default 0,
  stage text not null default 'new' check (stage in ('new', 'contacting', 'quoted', 'won', 'lost')),
  probability integer not null default 20 check (probability between 0 and 100),
  expected_close_date date,
  owner_name text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists crm_deals_shop_idx on public.crm_deals (shop_id, created_at desc);

-- ---------- 4. CRM: Chỉ tiêu (quota) ----------
create table if not exists public.crm_quotas (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  period text not null,                       -- 'YYYY-MM'
  target_amount numeric(14, 2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  unique (shop_id, period)
);
create index if not exists crm_quotas_shop_idx on public.crm_quotas (shop_id, period desc);

-- ---------- 5. CRM: Yêu cầu phê duyệt (approvals) ----------
create table if not exists public.crm_approvals (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  type text not null default 'discount',        -- 'discount' | 'debt' | 'quote' | 'other'
  title text not null,
  amount numeric(14, 2) not null default 0,
  requested_by text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason text,
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists crm_approvals_shop_idx on public.crm_approvals (shop_id, created_at desc);

-- ---------- 6. Trường tùy chỉnh (custom fields) ----------
create table if not exists public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  entity text not null check (entity in ('customer', 'product', 'order')),
  key text not null,
  label text not null,
  type text not null default 'text' check (type in ('text', 'number', 'date', 'select', 'boolean')),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (shop_id, entity, key)
);
create index if not exists custom_fields_shop_idx on public.custom_fields (shop_id, entity, sort_order);

-- ---------- 6. Bảng dữ liệu tùy chỉnh (custom tables) ----------create table if not exists public.custom_tables (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  columns jsonb not null default '[]'::jsonb,   -- [{key,label,type}]
  created_at timestamptz not null default now()
);
create index if not exists custom_tables_shop_idx on public.custom_tables (shop_id, created_at desc);

create table if not exists public.custom_table_rows (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  table_id uuid not null references public.custom_tables (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists custom_table_rows_idx on public.custom_table_rows (table_id, created_at desc);

-- ---------- 7. Cấu hình tích hợp (marketing, sepay, ai) ----------
create table if not exists public.integration_settings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  provider text not null,                       -- 'fbpage' | 'sms' | 'zbs' | 'sepay' | 'ai'
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (shop_id, provider)
);
create index if not exists integration_settings_shop_idx on public.integration_settings (shop_id, provider);

-- ---------- 8. API token cho hệ thống ngoài (external API) ----------
create table if not exists public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  token text not null,
  scopes text not null default 'read',
  last_used_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists api_tokens_shop_idx on public.api_tokens (shop_id, created_at desc);

-- ---------- 9. Yêu cầu nâng cấp gói (request-pro) ----------
create table if not exists public.upgrade_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  plan text not null,
  contact_name text,
  contact_phone text,
  note text,
  status text not null default 'pending' check (status in ('pending', 'contacted', 'done', 'cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists upgrade_requests_shop_idx on public.upgrade_requests (shop_id, created_at desc);

-- =============================================================
-- RLS cho tất cả bảng mới (đọc: thành viên shop; ghi: theo quyền)
-- =============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'sales_routes', 'sales_channels', 'crm_deals', 'crm_quotas', 'crm_approvals',
    'custom_fields', 'custom_tables', 'custom_table_rows',
    'integration_settings', 'api_tokens', 'upgrade_requests'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "shop member read" on public.%I', t);
    execute format(
      'create policy "shop member read" on public.%I for select using (public.is_shop_member(shop_id))', t);
    execute format('drop policy if exists "shop perm write" on public.%I', t);
    execute format(
      'create policy "shop perm write" on public.%I for all using (public.has_permission(shop_id, ''crm'')) with check (public.has_permission(shop_id, ''crm''))',
      t);
  end loop;
end $$;

-- Bảng thuần vận hành (không phải CRM): ghi theo quyền tương ứng
drop policy if exists "shop perm write" on public.sales_channels;
create policy "shop perm write" on public.sales_channels
  for all using (public.has_permission(shop_id, 'sell'))
  with check (public.has_permission(shop_id, 'sell'));

drop policy if exists "shop perm write" on public.sales_routes;
create policy "shop perm write" on public.sales_routes
  for all using (public.has_permission(shop_id, 'sell'))
  with check (public.has_permission(shop_id, 'sell'));

-- =============================================================
-- Ghi chú: các module cần API bên thứ ba (Fanpage, SMS, ZBS, SePay, AI)
-- dùng bảng integration_settings để LƯU CẤU HÌNH. Việc gửi/nhận thật
-- cần backend worker + API key của nhà cung cấp (ngoài phạm vi repo này).
-- =============================================================

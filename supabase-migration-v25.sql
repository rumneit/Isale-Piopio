-- =============================================================
-- PioPio — Migration v25: Đơn vận chuyển (shipments)
--   Đồng bộ kiến trúc ISale /shipping (audit-output/isale-shipping):
--   - shipments: vận đơn với 11 trạng thái chuẩn 3PL (có RTO)
--   - shipment_tracking_logs: lịch sử vận chuyển APPEND-ONLY
--   - webhook_inbox: hứng webhook hãng (P2) — idempotent + retry
-- Chạy trong Supabase Dashboard → SQL Editor → New query. Idempotent.
-- =============================================================

-- ---------- 1. Vận đơn (shipments) ----------
create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  order_code text,                                -- snapshot mã đơn (hiển thị nhanh, không join)
  partner_id uuid references public.shipping_partners (id) on delete set null,
  partner_name text,                              -- snapshot tên đối tác
  provider text not null default 'manual',        -- manual | ghn | ghtk | viettelpost | other
  tracking_code text not null,                    -- mã vận đơn
  status text not null default 'draft' check (status in (
    'draft', 'submitted', 'picking', 'in_transit', 'out_for_delivery',
    'delivered', 'failed', 'returning', 'returned', 'cancelled', 'exception'
  )),
  shipping_fee numeric(14, 2) not null default 0,
  cod_amount numeric(14, 2) not null default 0,   -- tiền thu hộ
  weight_g integer check (weight_g is null or weight_g > 0),      -- gram (đúng ISale)
  length_cm integer check (length_cm is null or length_cm > 0),   -- D-W-H tính phí
  width_cm  integer check (width_cm  is null or width_cm  > 0),
  height_cm integer check (height_cm is null or height_cm > 0),
  from_address text,                              -- địa chỉ gửi
  to_address text,                                -- địa chỉ nhận
  label_url text,                                 -- PDF vận đơn do hãng cấp (trống = in template A6)
  expected_delivered_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  fail_reason text,                               -- lost | damaged | wrong_address | other
  note text,
  external_ref text,                              -- mã tham chiếu bên hãng (dùng khi nối API P1+)
  idempotency_key text unique,                    -- chặn tạo trùng khi retry
  created_by text,                                -- id user tạo (chuẩn v12, không FK)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shipments_shop_idx on public.shipments (shop_id, created_at desc);
create index if not exists shipments_order_idx on public.shipments (order_id);
-- Chặn tạo trùng mã vận đơn trong cùng shop (mã hãng duy nhất khi có)
create unique index if not exists shipments_shop_tracking_uniq
  on public.shipments (shop_id, tracking_code)
  where provider <> 'manual';

-- ---------- 2. Lịch sử vận chuyển (append-only) ----------
create table if not exists public.shipment_tracking_logs (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  status text,                                    -- trạng thái tại thời điểm sự kiện
  description text,                               -- mô tả (VD: "Shipper Đỗ Văn B đang giao")
  location text,                                  -- vị trí (bưu cục, khu vực...)
  event_time timestamptz not null default now(),  -- thời gian sự kiện (theo hãng nếu có)
  raw jsonb,                                      -- payload thô của hãng (P2 webhook)
  created_at timestamptz not null default now()
);
create index if not exists shipment_logs_shipment_idx
  on public.shipment_tracking_logs (shipment_id, event_time desc);

-- ---------- 3. Hộp thư webhook hãng vận chuyển (P2 — dựng sẵn khung) ----------
create table if not exists public.webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  provider text not null,                         -- ghn | ghtk | viettelpost
  event_id text not null,                         -- id sự kiện bên hãng (idempotency)
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'done', 'failed')),
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create unique index if not exists webhook_inbox_uniq
  on public.webhook_inbox (provider, event_id);

-- =============================================================
-- RLS
-- =============================================================
do $$
declare t text;
begin
  foreach t in array array['shipments', 'shipment_tracking_logs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "shop member read" on public.%I', t);
    execute format(
      'create policy "shop member read" on public.%I for select using (public.is_shop_member(shop_id))', t);
  end loop;
end $$;

-- Vận chuyển thuộc quyền bán hàng (đồng bộ shipping_partners v14)
drop policy if exists "shop perm write" on public.shipments;
create policy "shop perm write" on public.shipments
  for all using (public.has_permission(shop_id, 'sell'))
  with check (public.has_permission(shop_id, 'sell'));

-- Logs: APPEND-ONLY — chỉ được INSERT (kèm SELECT ở trên); không có policy UPDATE/DELETE
drop policy if exists "shop append log" on public.shipment_tracking_logs;
create policy "shop append log" on public.shipment_tracking_logs
  for insert with check (public.has_permission(shop_id, 'sell'));

-- webhook_inbox: RLS bật, KHÔNG policy nào cho client (chỉ service_role của
-- Edge Function P2 thao tác) — chặn mọi truy cập từ anon/authenticated key.
alter table public.webhook_inbox enable row level security;

-- =============================================================
-- Khoá dữ liệu: sau khi rời "draft", không sửa payload vận chuyển
-- (địa chỉ/cước/mã hãng) — chỉ được đổi trạng thái. Giống ISale
-- chặn sửa sau khi tạo; sửa = tạo vận đơn mới.
-- =============================================================
create or replace function public.shipments_guard()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'UPDATE') then
    if old.status <> 'draft' and new.status <> 'draft' then
      if coalesce(new.from_address, '')   is distinct from coalesce(old.from_address, '')
      or coalesce(new.to_address, '')     is distinct from coalesce(old.to_address, '')
      or coalesce(new.tracking_code, '')  is distinct from coalesce(old.tracking_code, '')
      or coalesce(new.provider, '')       is distinct from coalesce(old.provider, '')
      or coalesce(new.shipping_fee, 0)    is distinct from coalesce(old.shipping_fee, 0)
      or coalesce(new.cod_amount, 0)      is distinct from coalesce(old.cod_amount, 0)
      or coalesce(new.weight_g, 0)        is distinct from coalesce(old.weight_g, 0) then
        raise exception 'Vận đơn đã rời trạng thái Nháp — không thể sửa payload. Hãy tạo vận đơn mới.';
      end if;
    end if;
    -- chuyển sang delivered/returned/cancelled thì đóng băng trạng thái (không quay lại)
    if old.status in ('delivered', 'returned', 'cancelled')
       and new.status <> old.status then
      raise exception 'Vận đơn đã ở trạng thái kết thúc (%), không thể đổi tiếp.', old.status;
    end if;
    new.updated_at = now();
    -- tự đóng dấu thời điểm
    if new.status = 'delivered'  and old.status <> 'delivered'  then new.delivered_at  = now(); end if;
    if new.status = 'cancelled'  and old.status <> 'cancelled'  then new.cancelled_at  = now(); end if;
  end if;
  return new;
end $$;

drop trigger if exists shipments_guard on public.shipments;
create trigger shipments_guard
  before update on public.shipments
  for each row execute function public.shipments_guard();

-- =============================================================
-- Realtime: đẩy thay đổi shipments lên UI (badge tự cập nhật).
-- Bọc try để idempotent với project chưa bật publication.
-- =============================================================
do $$
begin
  begin
    alter publication supabase_realtime add table public.shipments;
  exception when duplicate_object then null;  -- đã thêm trước đó
  when others then raise notice 'Realtime publication skip: %', sqlerrm;
  end;
end $$;

-- =============================================================
-- Ghi chú trung thực:
--  - P0: tạo vận đơn THỦ CÔNG (nhập mã hãng) — chưa gọi API GHN/GHTK.
--    Nối API hãng cần Edge Function giữ secrets (P1) — như ghi chú v14.
--  - webhook_inbox dựng sẵn khung để P2 cắm Edge Function mà không cần
--    migration mới.
-- =============================================================

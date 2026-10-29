-- ============================================================================
-- PioPio v43 — Bán hàng theo nhiều đơn vị (ISale: "Đơn vị khác")
--
-- Mục tiêu:
--   * order_items.qty vẫn là SỐ LƯỢNG QUY VỀ ĐƠN VỊ GỐC để trigger tồn kho,
--     báo cáo và các RPC cũ tiếp tục đúng.
--   * Lưu thêm đơn vị khách đã chọn (Thùng/Lốc/Kg...) để chi tiết đơn và hoá
--     đơn hiển thị đúng: 2 Thùng × 720.000 ₫ thay vì 80 Cái × 18.000 ₫.
--   * RPC security-definer để nhân viên bán hàng gắn được metadata này dù
--     order_items đã bị thu hồi quyền INSERT/UPDATE từ v36.
--
-- Chạy SAU v42. An toàn khi chạy lại nhiều lần.
-- ============================================================================

begin;

alter table public.order_items add column if not exists unit text;
alter table public.order_items add column if not exists unit_qty numeric(14, 3);
alter table public.order_items add column if not exists unit_conversion numeric(14, 3) not null default 1;
alter table public.order_items add column if not exists unit_price numeric(14, 2);

-- Đơn cũ: mặc định là đơn vị gốc, số lượng/giá giữ nguyên.
update public.order_items oi
   set unit_qty = coalesce(oi.unit_qty, oi.qty),
       unit_price = coalesce(oi.unit_price, oi.price),
       unit_conversion = coalesce(nullif(oi.unit_conversion, 0), 1)
 where oi.unit_qty is null
    or oi.unit_price is null
    or oi.unit_conversion is null
    or oi.unit_conversion = 0;

update public.order_items oi
   set unit = p.unit
  from public.products p
 where oi.product_id = p.id
   and oi.unit is null
   and p.unit is not null;

create or replace function public.inv_set_order_item_units(
  p_shop uuid,
  p_order_id uuid,
  p_items jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_unit text;
  v_qty numeric;
  v_conversion numeric;
  v_price numeric;
  v_base_qty numeric;
begin
  if not public.has_permission(p_shop, 'sell') then
    raise exception 'Bạn không có quyền lưu đơn vị bán.';
  end if;
  if p_order_id is null or not exists (
    select 1 from public.orders o where o.id = p_order_id and o.shop_id = p_shop
  ) then
    raise exception 'Đơn hàng không thuộc cửa hàng.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Danh sách đơn vị không hợp lệ.';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception 'Danh sách đơn vị quá lớn.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_id := nullif(v_item->>'id', '')::uuid;
    if v_id is null then
      raise exception 'Thiếu id dòng sản phẩm.';
    end if;

    v_unit := left(trim(coalesce(v_item->>'unit', '')), 100);
    if v_unit = '' then
      raise exception 'Tên đơn vị không hợp lệ.';
    end if;

    v_qty := coalesce(nullif(v_item->>'unit_qty', '')::numeric, 0);
    if v_qty <= 0 or v_qty >= 1e12 then
      raise exception 'Số lượng theo đơn vị không hợp lệ.';
    end if;

    v_conversion := coalesce(nullif(v_item->>'unit_conversion', '')::numeric, 1);
    if v_conversion <= 0 or v_conversion >= 1e9 then
      raise exception 'Tỷ lệ quy đổi đơn vị không hợp lệ.';
    end if;

    v_price := coalesce(nullif(v_item->>'unit_price', '')::numeric, 0);
    if v_price < 0 or v_price >= 1e13 then
      raise exception 'Giá theo đơn vị không hợp lệ.';
    end if;

    select oi.qty into v_base_qty
      from public.order_items oi
     where oi.id = v_id
       and oi.order_id = p_order_id
       for update;
    if not found then
      raise exception 'Dòng sản phẩm không thuộc đơn hàng.';
    end if;

    -- Không tin metadata từ client: số lượng theo đơn vị quy đổi phải khớp
    -- đúng số lượng gốc mà RPC tạo đơn đã ghi (qty vẫn là nguồn sự thật).
    if abs(v_qty * v_conversion - v_base_qty) > 0.001 then
      raise exception 'Số lượng theo đơn vị không khớp số lượng gốc.';
    end if;

    update public.order_items
       set unit = v_unit,
           unit_qty = v_qty,
           unit_conversion = v_conversion,
           unit_price = v_price
     where id = v_id
       and order_id = p_order_id;
  end loop;
end;
$$;

revoke all on function public.inv_set_order_item_units(uuid, uuid, jsonb) from public, anon;
grant execute on function public.inv_set_order_item_units(uuid, uuid, jsonb) to authenticated, service_role;

comment on column public.order_items.unit is
  'Đơn vị khách đã chọn khi bán (VD: Thùng). qty vẫn là số lượng quy về đơn vị gốc.';
comment on column public.order_items.unit_qty is
  'Số lượng theo đơn vị đã chọn (VD: 2 Thùng).';
comment on column public.order_items.unit_conversion is
  '1 đơn vị đã chọn = bao nhiêu đơn vị gốc (VD: 40).';
comment on column public.order_items.unit_price is
  'Giá bán theo đơn vị đã chọn (VD: 720000/Thùng).';

commit;

-- ---------------------------------------------------------------------------
-- Kiểm tra sau khi chạy (chạy riêng):
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema='public' and table_name='order_items'
--      and column_name in ('unit','unit_qty','unit_conversion','unit_price');
--
--   select id, name, qty, price, unit, unit_qty, unit_conversion, unit_price
--     from public.order_items
--    order by order_id, id
--    limit 20;
-- ---------------------------------------------------------------------------

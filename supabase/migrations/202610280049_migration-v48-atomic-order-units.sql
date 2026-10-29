-- ============================================================================
-- PioPio v48 — lưu metadata đơn vị bán trong cùng transaction tạo/sửa đơn
-- Chạy sau v47. Idempotent.
-- ============================================================================
begin;

create or replace function public._inv_apply_order_item_units(
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
  v_product uuid;
  v_row public.order_items%rowtype;
  v_used uuid[] := array[]::uuid[];
  v_unit text;
  v_unit_qty numeric;
  v_conversion numeric;
  v_unit_price numeric;
begin
  if not public.has_permission(p_shop, 'sell') then
    raise exception 'Bạn không có quyền lưu đơn vị bán.';
  end if;
  if not exists (select 1 from public.orders where id = p_order_id and shop_id = p_shop) then
    raise exception 'Đơn hàng không thuộc cửa hàng.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'Danh sách đơn vị không hợp lệ.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_unit := left(trim(coalesce(v_item->>'unit', '')), 100);
    v_unit_qty := nullif(v_item->>'unit_qty', '')::numeric;
    v_conversion := nullif(v_item->>'unit_conversion', '')::numeric;
    v_unit_price := nullif(v_item->>'unit_price', '')::numeric;

    -- Client cũ không gửi metadata: giữ tương thích và mặc định về đơn vị gốc.
    if v_unit = '' or v_unit_qty is null or v_conversion is null or v_unit_price is null then
      continue;
    end if;
    if v_unit_qty <= 0 or v_unit_qty >= 1e12
       or v_conversion <= 0 or v_conversion >= 1e9
       or v_unit_price < 0 or v_unit_price >= 1e13 then
      raise exception 'Metadata đơn vị bán không hợp lệ.';
    end if;

    v_id := nullif(v_item->>'id', '')::uuid;
    v_product := nullif(v_item->>'product_id', '')::uuid;
    v_row := null;

    if v_id is not null then
      select * into v_row
        from public.order_items
       where id = v_id and order_id = p_order_id and not (id = any(v_used))
       for update;
    end if;

    if v_row.id is null then
      select * into v_row
        from public.order_items oi
       where oi.order_id = p_order_id
         and not (oi.id = any(v_used))
         and oi.product_id is not distinct from v_product
         and oi.name = trim(coalesce(v_item->>'name', ''))
         and abs(oi.qty - (v_item->>'qty')::numeric) < 0.0001
         and abs(oi.price - (v_item->>'price')::numeric) < 0.005
       order by oi.id
       limit 1
       for update;
    end if;

    if v_row.id is null then
      raise exception 'Không ghép được dòng sản phẩm để lưu đơn vị bán.';
    end if;
    if abs(v_unit_qty * v_conversion - v_row.qty) > 0.001 then
      raise exception 'Số lượng theo đơn vị không khớp số lượng gốc.';
    end if;

    update public.order_items
       set unit = v_unit,
           unit_qty = v_unit_qty,
           unit_conversion = v_conversion,
           unit_price = v_unit_price
     where id = v_row.id and order_id = p_order_id;
    v_used := array_append(v_used, v_row.id);
  end loop;
end;
$$;

revoke all on function public._inv_apply_order_item_units(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public._inv_apply_order_item_units(uuid,uuid,jsonb) to service_role;

create or replace function public.inv_create_order_v48(
  p_shop uuid, p_order jsonb, p_items jsonb, p_nonce uuid,
  p_record_income boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order jsonb;
begin
  v_order := public.inv_create_order(p_shop, p_order, p_items, p_nonce, p_record_income);
  perform public._inv_apply_order_item_units(p_shop, (v_order->>'id')::uuid, p_items);
  return v_order;
end;
$$;

create or replace function public.inv_update_order_full_v48(
  p_shop uuid,
  p_order_id uuid,
  p_order jsonb,
  p_items jsonb,
  p_adjust_income boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order jsonb;
begin
  v_order := public.inv_update_order_full(p_shop, p_order_id, p_order, p_items, p_adjust_income);
  perform public._inv_apply_order_item_units(p_shop, p_order_id, p_items);
  return v_order;
end;
$$;

revoke all on function public.inv_create_order_v48(uuid,jsonb,jsonb,uuid,boolean) from public, anon;
revoke all on function public.inv_update_order_full_v48(uuid,uuid,jsonb,jsonb,boolean) from public, anon;
grant execute on function public.inv_create_order_v48(uuid,jsonb,jsonb,uuid,boolean) to authenticated, service_role;
grant execute on function public.inv_update_order_full_v48(uuid,uuid,jsonb,jsonb,boolean) to authenticated, service_role;

commit;

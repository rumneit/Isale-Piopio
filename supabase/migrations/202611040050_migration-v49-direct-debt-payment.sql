-- PioPio v49 — tách trạng thái giao hàng khỏi phương thức thanh toán/công nợ.
-- Keep in sync with /supabase-migration-v49-direct-debt-payment.sql.
begin;

do $$
begin
  if to_regprocedure('public.inv_create_order_v48(uuid,jsonb,jsonb,uuid,boolean)') is null
     or to_regprocedure('public.inv_update_order_full_v48(uuid,uuid,jsonb,jsonb,boolean)') is null then
    raise exception 'v49 cần chạy migration v48 trước.';
  end if;
end $$;

create or replace function public.orders_debt_before()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_nonbillable text[] := array['draft','quote','debt','ship_debt','consignment','cancelled'];
begin
  if new.status = any(v_nonbillable)
     or upper(coalesce(new.payment_method, '')) = 'DEBT' then
    new.paid := false;
  elsif tg_op = 'UPDATE'
        and (old.status = any(v_nonbillable)
             or upper(coalesce(old.payment_method, '')) = 'DEBT') then
    new.paid := true;
  end if;
  new.debt_amount := public.order_debt_value(new.id, new.total, new.paid, new.status);
  return new;
end $$;

drop trigger if exists orders_debt_before on public.orders;
create trigger orders_debt_before
before insert or update of total, paid, status, payment_method on public.orders
for each row execute function public.orders_debt_before();

create or replace function public.inv_set_order_paid(
  p_shop uuid, p_order_id uuid, p_paid boolean
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  r record;
begin
  if not public.has_permission(p_shop, 'sell') then raise exception 'Bạn không có quyền cập nhật thanh toán đơn hàng.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sale:' || p_order_id::text, 0));
  select * into v_order from public.orders where id = p_order_id and shop_id = p_shop for update;
  if not found then raise exception 'Không tìm thấy đơn hàng.'; end if;
  if coalesce(p_paid, false) then
    if v_order.status in ('cancelled', 'quote') then raise exception 'Không thể đánh dấu đã thanh toán cho đơn đã hủy/báo giá.'; end if;
    if upper(coalesce(v_order.payment_method, '')) = 'DEBT' then raise exception 'Đơn đang chọn Công nợ. Hãy đổi phương thức thanh toán trước.'; end if;
    update public.orders set paid = true where id = p_order_id;
    select * into v_order from public.orders where id = p_order_id;
    perform public._inv_ensure_order_income(p_shop,p_order_id,v_order.total,v_order.code,v_order.account_id,v_order.payment_method);
  else
    for r in select id from public.transactions where shop_id=p_shop and order_id=p_order_id and source='order' and category='Bán hàng' for update loop
      perform set_config('piopio.allow_order_tx', r.id::text, true);
      delete from public.transactions where id=r.id;
      perform set_config('piopio.allow_order_tx', '', true);
    end loop;
    update public.orders set paid=false where id=p_order_id;
  end if;
  select * into v_order from public.orders where id=p_order_id;
  return to_jsonb(v_order);
end $$;
revoke all on function public.inv_set_order_paid(uuid,uuid,boolean) from public, anon;
grant execute on function public.inv_set_order_paid(uuid,uuid,boolean) to authenticated, service_role;

create or replace function public.inv_set_order_payment(
  p_shop uuid, p_order_id uuid, p_method text
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_method text;
begin
  if not public.has_permission(p_shop, 'sell') then raise exception 'Bạn không có quyền sửa đơn hàng.'; end if;
  v_method := upper(nullif(trim(coalesce(p_method, '')), ''));
  if v_method is not null and length(v_method)>40 then raise exception 'Hình thức thanh toán không hợp lệ.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sale:' || p_order_id::text, 0));
  select * into v_order from public.orders where id=p_order_id and shop_id=p_shop for update;
  if not found then raise exception 'Không tìm thấy đơn hàng.'; end if;
  if v_method='DEBT' and v_order.customer_id is null then raise exception 'Đơn công nợ phải chọn khách hàng.'; end if;
  update public.orders set payment_method=v_method where id=p_order_id returning * into v_order;
  if v_method='DEBT' then return public.inv_set_order_paid(p_shop,p_order_id,false); end if;
  if public._inv_is_billable_status(v_order.status) and coalesce(v_order.paid,false) then
    return public.inv_set_order_paid(p_shop,p_order_id,true);
  end if;
  return to_jsonb(v_order);
end $$;
revoke all on function public.inv_set_order_payment(uuid,uuid,text) from public, anon;
grant execute on function public.inv_set_order_payment(uuid,uuid,text) to authenticated, service_role;

create or replace function public.inv_create_order_v49(
  p_shop uuid, p_order jsonb, p_items jsonb, p_nonce uuid,
  p_record_income boolean default false
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_order jsonb;
  v_payload jsonb;
  v_method text;
  v_status text;
  v_paid boolean;
begin
  v_method := upper(coalesce(nullif(trim(p_order->>'payment_method'), ''), 'CASH'));
  v_status := coalesce(nullif(trim(p_order->>'status'), ''), 'completed');
  v_paid := public._inv_is_billable_status(v_status) and v_method <> 'DEBT';
  if v_method = 'DEBT' and nullif(p_order->>'customer_id', '') is null then
    raise exception 'Đơn công nợ phải chọn khách hàng.';
  end if;
  v_payload := p_order || jsonb_build_object(
    'payment_method', v_method,
    'paid', v_paid,
    'account_id', case when v_paid then p_order->'account_id' else 'null'::jsonb end
  );
  v_order := public.inv_create_order_v48(
    p_shop, v_payload, p_items, p_nonce, p_record_income and v_paid
  );
  if not v_paid then
    update public.orders set account_id = null
     where id = (v_order->>'id')::uuid and shop_id = p_shop;
  end if;
  select to_jsonb(o) into v_order from public.orders o
   where o.id = (v_order->>'id')::uuid and o.shop_id = p_shop;
  return v_order;
end;
$$;

create or replace function public.inv_update_order_full_v49(
  p_shop uuid, p_order_id uuid, p_order jsonb, p_items jsonb,
  p_adjust_income boolean default true
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_order jsonb;
  v_payload jsonb;
  v_method text;
  v_status text;
  v_paid boolean;
  v_account uuid;
begin
  v_method := upper(coalesce(nullif(trim(p_order->>'payment_method'), ''), 'CASH'));
  v_status := coalesce(nullif(trim(p_order->>'status'), ''), 'completed');
  v_paid := public._inv_is_billable_status(v_status) and v_method <> 'DEBT';
  if v_method = 'DEBT' and nullif(p_order->>'customer_id', '') is null then
    raise exception 'Đơn công nợ phải chọn khách hàng.';
  end if;
  v_payload := p_order || jsonb_build_object('payment_method', v_method);
  v_order := public.inv_update_order_full_v48(
    p_shop, p_order_id, v_payload, p_items, p_adjust_income
  );
  if p_order ? 'account_id' then
    v_account := nullif(p_order->>'account_id', '')::uuid;
    perform public.inv_set_order_account(
      p_shop, p_order_id, case when v_paid then v_account else null end
    );
  end if;
  v_order := public.inv_set_order_paid(p_shop, p_order_id, v_paid);
  return v_order;
end;
$$;

revoke all on function public.inv_create_order_v49(uuid,jsonb,jsonb,uuid,boolean) from public, anon;
revoke all on function public.inv_update_order_full_v49(uuid,uuid,jsonb,jsonb,boolean) from public, anon;
grant execute on function public.inv_create_order_v49(uuid,jsonb,jsonb,uuid,boolean) to authenticated, service_role;
grant execute on function public.inv_update_order_full_v49(uuid,uuid,jsonb,jsonb,boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

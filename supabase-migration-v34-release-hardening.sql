-- ============================================================================
-- PioPio v34 — Release hardening: atomic documents, idempotency, storage/RLS
-- Run AFTER v24, v27, v28 and v29. Additive and safe to re-run.
-- ============================================================================

alter table public.orders add column if not exists payment_method text;
alter table public.orders add column if not exists idempotency_key uuid;
alter table public.received_notes add column if not exists idempotency_key uuid;
alter table public.return_notes add column if not exists idempotency_key uuid;

create unique index if not exists orders_idempotency_uniq
  on public.orders(shop_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists received_notes_idempotency_uniq
  on public.received_notes(shop_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists return_notes_idempotency_uniq
  on public.return_notes(shop_id, idempotency_key) where idempotency_key is not null;

-- P0: the original "profile self" FOR ALL policy let a staff member update
-- their own role/permissions to owner. RLS decides rows, this trigger protects
-- sensitive columns while still allowing self-service display-name changes.
create or replace function public.profiles_protect_privileges()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then return new; end if;
  if (exists(select 1 from public.shops s where s.owner_id=auth.uid() and s.id=old.shop_id)
      or exists(select 1 from public.shops s where s.owner_id=auth.uid() and s.id=new.shop_id))
     and (old.shop_id is null or exists(
       select 1 from public.shops s where s.owner_id=auth.uid() and s.id=old.shop_id))
     and (new.shop_id is null or exists(
       select 1 from public.shops s where s.owner_id=auth.uid() and s.id=new.shop_id)) then
    return new;
  end if;
  if old.id=auth.uid() then
    if new.id is distinct from old.id or new.shop_id is distinct from old.shop_id
       or new.role is distinct from old.role or new.permissions is distinct from old.permissions then
      raise exception 'Bạn không thể tự thay đổi vai trò, cửa hàng hoặc quyền.';
    end if;
    return new;
  end if;
  raise exception 'Bạn không có quyền sửa hồ sơ này.';
end;
$$;
drop trigger if exists profiles_protect_privileges_trg on public.profiles;
create trigger profiles_protect_privileges_trg before update on public.profiles
for each row execute function public.profiles_protect_privileges();

drop policy if exists "profile self" on public.profiles;
drop policy if exists "profile self read" on public.profiles;
drop policy if exists "profile self update" on public.profiles;
drop policy if exists "profile owner update" on public.profiles;
create policy "profile self read" on public.profiles for select using(id=auth.uid());
create policy "profile self update" on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());
create policy "profile owner update" on public.profiles for update
using(exists(select 1 from public.shops s where s.id=profiles.shop_id and s.owner_id=auth.uid()))
with check(exists(select 1 from public.shops s where s.id=profiles.shop_id and s.owner_id=auth.uid()));

-- Secrets/configuration are owner-only at DB level, not merely hidden in UI.
-- These modules are optional and may have been intentionally removed, so do
-- not require their legacy tables to exist.
do $$
begin
  if to_regclass('public.integration_settings') is not null then
    execute 'drop policy if exists "shop member read" on public.integration_settings';
    execute 'drop policy if exists "shop perm write" on public.integration_settings';
    execute 'drop policy if exists "integration owner all" on public.integration_settings';
    execute $policy$
      create policy "integration owner all" on public.integration_settings for all
      using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid()))
      with check(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid()))
    $policy$;
  end if;

  if to_regclass('public.api_tokens') is not null then
    execute 'drop policy if exists "shop member read" on public.api_tokens';
    execute 'drop policy if exists "shop perm write" on public.api_tokens';
    execute 'drop policy if exists "api token owner all" on public.api_tokens';
    execute $policy$
      create policy "api token owner all" on public.api_tokens for all
      using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid()))
      with check(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid()))
    $policy$;
  end if;
end $$;

-- Order + lines + optional income are committed or rolled back together. Existing
-- order-item triggers in v27 update the inventory ledger inside this transaction.
create or replace function public.inv_create_order(
  p_shop uuid, p_order jsonb, p_items jsonb, p_nonce uuid,
  p_record_income boolean default false
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item jsonb;
  v_total numeric;
  v_discount numeric;
  v_ship numeric;
begin
  if not public.has_permission(p_shop, 'sell') then
    raise exception 'Bạn không có quyền tạo đơn hàng.';
  end if;
  if p_nonce is null then raise exception 'Thiếu khóa chống gửi lặp.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('order:' || p_shop::text || ':' || p_nonce::text, 0));
  select * into v_order from public.orders
   where shop_id = p_shop and idempotency_key = p_nonce limit 1;
  if found then return to_jsonb(v_order); end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Đơn hàng cần ít nhất một sản phẩm.';
  end if;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if length(trim(coalesce(v_item->>'name', ''))) = 0 then raise exception 'Tên sản phẩm không hợp lệ.'; end if;
    if coalesce(nullif(v_item->>'qty', '')::numeric, 0) <= 0 then raise exception 'Số lượng phải lớn hơn 0.'; end if;
    if coalesce(nullif(v_item->>'price', '')::numeric, -1) < 0 then raise exception 'Giá bán không hợp lệ.'; end if;
    if nullif(v_item->>'product_id', '') is not null and not exists (
      select 1 from public.products where id = (v_item->>'product_id')::uuid and shop_id = p_shop
    ) then raise exception 'Sản phẩm không thuộc cửa hàng.'; end if;
  end loop;

  v_discount := greatest(0, coalesce(nullif(p_order->>'discount', '')::numeric, 0));
  v_ship := greatest(0, coalesce(nullif(p_order->>'ship_fee', '')::numeric, 0));
  v_total := coalesce(nullif(p_order->>'total', '')::numeric,
    (select sum((x->>'price')::numeric * (x->>'qty')::numeric) from jsonb_array_elements(p_items) x)
      - v_discount + case when coalesce((p_order->>'ship_fee_by_customer')::boolean, true) then v_ship else 0 end);
  if v_total < 0 or v_total >= 1e13 then raise exception 'Tổng tiền không hợp lệ.'; end if;

  insert into public.orders(
    shop_id, code, customer_id, customer_name, status, total, discount, paid, note,
    channel_id, payment_method, ship_fee, ship_fee_by_customer, customer_phone,
    customer_address, shipping_code, shipping_partner, shipper_name, shipper_phone,
    shipping_address, idempotency_key
  ) values (
    p_shop, nullif(trim(p_order->>'code'), ''), nullif(p_order->>'customer_id', '')::uuid,
    nullif(trim(p_order->>'customer_name'), ''), coalesce(nullif(p_order->>'status', ''), 'completed'),
    v_total, v_discount, coalesce((p_order->>'paid')::boolean, true), nullif(p_order->>'note', ''),
    nullif(p_order->>'channel_id', '')::uuid, nullif(p_order->>'payment_method', ''), v_ship,
    coalesce((p_order->>'ship_fee_by_customer')::boolean, true), nullif(p_order->>'customer_phone', ''),
    nullif(p_order->>'customer_address', ''), nullif(p_order->>'shipping_code', ''),
    nullif(p_order->>'shipping_partner', ''), nullif(p_order->>'shipper_name', ''),
    nullif(p_order->>'shipper_phone', ''), nullif(p_order->>'shipping_address', ''), p_nonce
  ) returning * into v_order;

  insert into public.order_items(order_id, product_id, name, price, qty, total)
  select v_order.id, nullif(x->>'product_id', '')::uuid, trim(x->>'name'),
         (x->>'price')::numeric, (x->>'qty')::numeric,
         (x->>'price')::numeric * (x->>'qty')::numeric
    from jsonb_array_elements(p_items) x;

  if p_record_income and v_total > 0 then
    insert into public.transactions(shop_id, type, category, amount, note, occurred_at,
                                    order_id, source, client_nonce)
    values(p_shop, 'income', 'Bán hàng', v_total, 'Thu tiền đơn ' || v_order.code,
           now(), v_order.id, 'order', 'order:' || p_nonce::text);
  end if;
  return to_jsonb(v_order);
end;
$$;

-- Receipt + inventory + paid expense + supplier debt in one transaction.
create or replace function public.inv_create_received_note(
  p_shop uuid, p_note jsonb, p_items jsonb, p_nonce uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_note public.received_notes%rowtype;
  v_total numeric; v_paid numeric; v_remain numeric; v_status text; v_item jsonb;
  v_can_approve boolean; v_actor text;
begin
  if not public.has_permission(p_shop, 'inventory') then raise exception 'Bạn không có quyền nhập kho.'; end if;
  if p_nonce is null then raise exception 'Thiếu khóa chống gửi lặp.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('received:' || p_shop::text || ':' || p_nonce::text, 0));
  select * into v_note from public.received_notes where shop_id=p_shop and idempotency_key=p_nonce limit 1;
  if found then return to_jsonb(v_note); end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'Phiếu nhập cần ít nhất một sản phẩm.'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(nullif(v_item->>'qty','')::numeric,0)<=0 then raise exception 'Số lượng nhập phải lớn hơn 0.'; end if;
    if coalesce(nullif(v_item->>'cost','')::numeric,-1)<0 then raise exception 'Giá nhập không hợp lệ.'; end if;
    if nullif(v_item->>'product_id','') is not null and not exists(
      select 1 from products where id=(v_item->>'product_id')::uuid and shop_id=p_shop
    ) then raise exception 'Sản phẩm không thuộc cửa hàng.'; end if;
  end loop;
  select coalesce(sum((x->>'qty')::numeric*(x->>'cost')::numeric),0) into v_total from jsonb_array_elements(p_items)x;
  v_paid := least(v_total, greatest(0, coalesce(nullif(p_note->>'paid_amount','')::numeric,
    case when coalesce((p_note->>'paid')::boolean,true) then v_total else 0 end)));
  v_can_approve := public.has_permission(p_shop, 'inventory_approve');
  v_status := case when not v_can_approve then 'pending' when exists(
    select 1 from jsonb_array_elements(p_items)x
    where coalesce(nullif(x->>'qty_ordered','')::numeric,(x->>'qty')::numeric)>(x->>'qty')::numeric
  ) then 'partial' else 'completed' end;
  select coalesce(full_name,auth.uid()::text) into v_actor from profiles where id=auth.uid();

  insert into public.received_notes(shop_id,code,supplier_name,total,items,paid,note,supplier_id,
    paid_amount,due_date,status,parent_id,created_by,approved_by,approved_at,idempotency_key)
  values(p_shop,nullif(trim(p_note->>'code'),''),nullif(p_note->>'supplier_name',''),v_total,p_items,
    coalesce((p_note->>'paid')::boolean,true),nullif(p_note->>'note',''),nullif(p_note->>'supplier_id','')::uuid,
    v_paid,nullif(p_note->>'due_date','')::date,v_status,nullif(p_note->>'parent_id','')::uuid,auth.uid(),
    case when v_can_approve then v_actor else null end,case when v_can_approve then now() else null end,p_nonce)
  returning * into v_note;
  if not v_can_approve then return to_jsonb(v_note); end if;

  perform public.inv_apply_note(p_shop,'received_note',v_note.id,p_items);
  if v_paid>0 then
    insert into transactions(shop_id,type,category,amount,note,occurred_at,source,client_nonce)
    values(p_shop,'expense','Nhập hàng',v_paid,'Nhập hàng '||v_note.code||coalesce(' — '||nullif(v_note.supplier_name,''),''),
      now(),'received_note','received:'||p_nonce::text);
  end if;
  v_remain:=v_total-v_paid;
  if v_note.supplier_id is not null and v_remain>0 then
    insert into supplier_debts(shop_id,supplier_id,received_note_id,amount,paid_amount,due_date,status,note,created_by)
    values(p_shop,v_note.supplier_id,v_note.id,v_remain,0,v_note.due_date,'open','Nhập hàng '||v_note.code,v_actor);
  end if;
  return to_jsonb(v_note);
end;
$$;

-- Return note + stock restoration + optional refund are atomic.
create or replace function public.inv_create_return_note(
  p_shop uuid, p_note jsonb, p_items jsonb, p_nonce uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_note public.return_notes%rowtype; v_total numeric; v_item jsonb;
begin
  if not public.has_permission(p_shop,'sell') then raise exception 'Bạn không có quyền trả hàng.'; end if;
  if p_nonce is null then raise exception 'Thiếu khóa chống gửi lặp.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('return:'||p_shop::text||':'||p_nonce::text,0));
  select * into v_note from return_notes where shop_id=p_shop and idempotency_key=p_nonce limit 1;
  if found then return to_jsonb(v_note); end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Phiếu trả cần ít nhất một sản phẩm.'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(nullif(v_item->>'qty','')::numeric,0)<=0 then raise exception 'Số lượng trả phải lớn hơn 0.'; end if;
    if coalesce(nullif(v_item->>'price','')::numeric,-1)<0 then raise exception 'Giá trả không hợp lệ.'; end if;
    if nullif(v_item->>'product_id','') is not null and not exists(select 1 from products where id=(v_item->>'product_id')::uuid and shop_id=p_shop) then raise exception 'Sản phẩm không thuộc cửa hàng.'; end if;
  end loop;
  if nullif(p_note->>'order_id','') is not null and not exists(select 1 from orders where id=(p_note->>'order_id')::uuid and shop_id=p_shop) then raise exception 'Đơn hàng không thuộc cửa hàng.'; end if;
  select coalesce(sum((x->>'qty')::numeric*(x->>'price')::numeric),0) into v_total from jsonb_array_elements(p_items)x;
  insert into return_notes(shop_id,order_id,order_code,code,customer_id,items,total,refunded,note,idempotency_key)
  values(p_shop,nullif(p_note->>'order_id','')::uuid,nullif(p_note->>'order_code',''),nullif(trim(p_note->>'code'),''),
    nullif(p_note->>'customer_id','')::uuid,p_items,v_total,coalesce((p_note->>'refunded')::boolean,true),nullif(p_note->>'note',''),p_nonce)
  returning * into v_note;
  perform public.inv_apply_note(p_shop,'return_note',v_note.id,p_items);
  if v_note.refunded and v_total>0 then
    insert into transactions(shop_id,type,category,amount,note,occurred_at,source,client_nonce)
    values(p_shop,'expense','Trả hàng',v_total,'Hoàn tiền trả hàng '||coalesce(v_note.order_code,'')||' → '||v_note.code,
      now(),'return_note','return:'||p_nonce::text);
  end if;
  return to_jsonb(v_note);
end;
$$;

grant execute on function public.inv_create_order(uuid,jsonb,jsonb,uuid,boolean) to authenticated;
grant execute on function public.inv_create_received_note(uuid,jsonb,jsonb,uuid) to authenticated;
grant execute on function public.inv_create_return_note(uuid,jsonb,jsonb,uuid) to authenticated;

-- Phase 1 keeps direct INSERT grants temporarily so the currently deployed
-- frontend remains usable while v34 is applied. v35 revokes them after the
-- new RPC-based frontend is live.
drop policy if exists "shop member all" on public.orders;
drop policy if exists "orders member read" on public.orders;
drop policy if exists "orders sell update delete" on public.orders;
create policy "orders member read" on public.orders for select using(public.is_shop_member(shop_id));
create policy "orders sell update delete" on public.orders for all
  using(public.has_permission(shop_id,'sell')) with check(public.has_permission(shop_id,'sell'));

drop policy if exists "shop member all" on public.order_items;
drop policy if exists "order items member read" on public.order_items;
drop policy if exists "order items sell write" on public.order_items;
create policy "order items member read" on public.order_items for select using(exists(
  select 1 from public.orders o where o.id=order_id and public.is_shop_member(o.shop_id)));
create policy "order items sell write" on public.order_items for all using(exists(
  select 1 from public.orders o where o.id=order_id and public.has_permission(o.shop_id,'sell')))
with check(exists(select 1 from public.orders o where o.id=order_id and public.has_permission(o.shop_id,'sell')));

-- Return notes were still using the old member-full-access policy.
drop policy if exists "shop member all" on public.return_notes;
drop policy if exists "return member read" on public.return_notes;
drop policy if exists "return sell write" on public.return_notes;
create policy "return member read" on public.return_notes for select using(public.is_shop_member(shop_id));
create policy "return sell write" on public.return_notes for all
  using(public.has_permission(shop_id,'sell')) with check(public.has_permission(shop_id,'sell'));

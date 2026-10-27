-- ============================================================================
-- PioPio v45 — delete orders safely + invoice debt snapshot
-- Chạy sau v43-order-money-integrity và v44.
-- Idempotent.
-- ============================================================================
begin;

alter table public.orders
  add column if not exists customer_debt_before numeric(16,2);

create or replace function public.orders_capture_customer_debt_before()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_debt_before is null and new.customer_id is not null then
    select greatest(0, coalesce(c.debt, 0))
      into new.customer_debt_before
      from public.customers c
     where c.id = new.customer_id and c.shop_id = new.shop_id;
  end if;
  new.customer_debt_before := greatest(0, coalesce(new.customer_debt_before, 0));
  return new;
end $$;

drop trigger if exists orders_capture_customer_debt_before on public.orders;
create trigger orders_capture_customer_debt_before
before insert on public.orders
for each row execute function public.orders_capture_customer_debt_before();

-- Xóa đơn là thao tác xác nhận riêng của người dùng, vì vậy phải đảo toàn bộ
-- giao dịch gắn trực tiếp với đơn trong cùng transaction. Bản v43 chỉ chặn khi
-- có giao dịch, khiến các đơn nháp cũ (từng sinh khoản thu tự động) không thể xóa.
create or replace function public.inv_delete_order(p_shop uuid, p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  r record;
begin
  if not public.has_permission(p_shop, 'sell') then
    raise exception 'Bạn không có quyền xóa đơn hàng.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sale:' || p_order_id::text, 0));
  select * into v_order
    from public.orders
   where id = p_order_id and shop_id = p_shop
   for update;
  if not found then raise exception 'Không tìm thấy đơn hàng.'; end if;

  if exists (select 1 from public.return_notes where order_id = p_order_id) then
    raise exception 'Đơn % đã có phiếu trả hàng, không thể xóa.', v_order.code;
  end if;

  for r in
    select id
      from public.transactions
     where shop_id = p_shop and order_id = p_order_id
     for update
  loop
    perform set_config('piopio.allow_order_tx', r.id::text, true);
    delete from public.transactions where id = r.id;
    perform set_config('piopio.allow_order_tx', '', true);
  end loop;

  -- Trigger tồn kho/công nợ hiện có tự hoàn tác phần còn lại.
  delete from public.orders where id = p_order_id and shop_id = p_shop;
end $$;

revoke all on function public.inv_delete_order(uuid,uuid) from public, anon;
grant execute on function public.inv_delete_order(uuid,uuid) to authenticated, service_role;

comment on column public.orders.customer_debt_before is
  'Công nợ khách hàng ngay trước thời điểm tạo đơn, dùng để in bill lịch sử ổn định.';

commit;

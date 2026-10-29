-- ============================================================================
-- PioPio v46 — xóa đơn nhất quán, kể cả đơn đã có dữ liệu liên quan
-- Chạy sau v45. Idempotent.
--
-- Phiếu trả hàng / vận đơn vẫn được giữ làm lịch sử; khóa ngoại hiện có sẽ tự
-- đặt order_id = null. Các giao dịch gắn với đơn được đảo trong cùng transaction.
-- ============================================================================
begin;

create or replace function public.inv_delete_order(p_shop uuid, p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_tx record;
begin
  if not public.has_permission(p_shop, 'sell') then
    raise exception 'Bạn không có quyền xóa đơn hàng.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sale:' || p_order_id::text, 0));

  select * into v_order
    from public.orders
   where id = p_order_id and shop_id = p_shop
   for update;

  if not found then
    raise exception 'Không tìm thấy đơn hàng hoặc đơn không thuộc cửa hàng hiện tại.';
  end if;

  -- Mở khóa đúng từng giao dịch hệ thống để trigger sổ quỹ/công nợ hoàn tác.
  for v_tx in
    select id
      from public.transactions
     where shop_id = p_shop and order_id = p_order_id
     order by created_at desc, id
     for update
  loop
    perform set_config('piopio.allow_order_tx', v_tx.id::text, true);
    delete from public.transactions
     where id = v_tx.id and shop_id = p_shop and order_id = p_order_id;
    perform set_config('piopio.allow_order_tx', '', true);
  end loop;

  -- return_notes và shipments dùng ON DELETE SET NULL nên lịch sử vẫn còn;
  -- order_items dùng ON DELETE CASCADE. Trigger orders_debt_after hoàn công nợ.
  delete from public.orders where id = p_order_id and shop_id = p_shop;

  if not found then
    raise exception 'Không thể xóa đơn %. Vui lòng tải lại và thử lại.', v_order.code;
  end if;
end $$;

revoke all on function public.inv_delete_order(uuid,uuid) from public, anon;
grant execute on function public.inv_delete_order(uuid,uuid) to authenticated, service_role;

comment on function public.inv_delete_order(uuid,uuid) is
  'Xóa đơn nguyên tử; đảo giao dịch, tồn kho và công nợ; giữ phiếu trả/vận đơn dạng lịch sử độc lập.';

commit;

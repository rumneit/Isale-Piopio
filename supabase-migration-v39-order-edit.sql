-- ============================================================================
-- PioPio v39 — Sửa sản phẩm của đơn đã tạo
--
-- Bối cảnh: từ v35/v36, vai trò "authenticated" không còn quyền UPDATE/DELETE
-- trực tiếp trên public.order_items (để bảo vệ tồn kho). Vì vậy màn hình chi
-- tiết đơn hàng khi sửa giá / xóa sản phẩm bị lỗi "permission denied".
--
-- Hàm dưới đây chạy với quyền security definer, kiểm tra quyền bán hàng của
-- người dùng, cập nhật đơn + các dòng sản phẩm trong cùng một transaction.
-- Trigger v27 vẫn tự hoàn tồn khi xóa dòng; trigger v36 vẫn chặn tồn âm.
--
-- Cách chạy: Supabase Dashboard → SQL Editor → dán toàn bộ file → Run.
-- An toàn khi chạy lại nhiều lần.
-- ============================================================================

-- Cho phép RPC inv_update_order điều chỉnh đúng khoản thu của đơn hàng.
-- Trigger transactions_guard v24 vẫn chặn mọi sửa/xóa thủ công khác.
create or replace function public.transactions_guard()
returns trigger
language plpgsql
as $$
begin
  if current_setting('piopio.allow_order_tx', true) = old.id::text then
    return coalesce(new, old);
  end if;
  if coalesce(old.source, 'manual') <> 'manual' then
    raise exception 'Giao dịch này thuộc về % nên không thể sửa/xóa thủ công. Hãy thao tác qua đối tượng gốc.',
      case old.source
        when 'order' then 'đơn hàng'
        when 'debt' then 'công nợ'
        when 'recurring' then 'giao dịch định kỳ'
        when 'transfer' then 'chuyển tiền nội bộ'
        else 'hệ thống'
      end;
  end if;
  return coalesce(new, old);
end $$;

create or replace function public.inv_update_order(
  p_shop uuid,
  p_order_id uuid,
  p_items jsonb,
  p_discount numeric,
  p_total numeric,
  p_adjust_income boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_old_total numeric;
  v_item jsonb;
  v_id uuid;
  v_price numeric;
  v_merch numeric := 0;
  v_discount numeric;
  v_total numeric;
  v_income public.transactions%rowtype;
  v_delta numeric;
  v_ids uuid[];
begin
  if not public.has_permission(p_shop, 'sell') then
    raise exception 'Bạn không có quyền sửa đơn hàng.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Đơn hàng phải còn ít nhất một sản phẩm.';
  end if;

  -- Khóa theo đơn để tránh hai lần lưu chồng nhau (cùng khóa với trigger kho).
  perform pg_advisory_xact_lock(hashtextextended('sale:' || p_order_id::text, 0));

  select * into v_order
    from public.orders
   where id = p_order_id and shop_id = p_shop
   for update;
  if not found then
    raise exception 'Đơn hàng không tồn tại.';
  end if;
  v_old_total := coalesce(v_order.total, 0);

  -- Kiểm tra danh sách dòng gửi lên: đủ id, không trùng, giá hợp lệ.
  if exists (
    select 1 from jsonb_array_elements(p_items) x
     where nullif(x->>'id', '') is null
  ) then
    raise exception 'Thiếu mã dòng sản phẩm.';
  end if;

  select array_agg((x->>'id')::uuid)
    into v_ids
    from jsonb_array_elements(p_items) x;

  if cardinality(v_ids) <> (select count(distinct t.id) from unnest(v_ids) as t(id)) then
    raise exception 'Dòng sản phẩm bị trùng.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_id := (v_item->>'id')::uuid;
    v_price := coalesce(nullif(v_item->>'price', '')::numeric, -1);
    if v_price < 0 then
      raise exception 'Giá bán không hợp lệ.';
    end if;
    if not exists (
      select 1 from public.order_items
       where id = v_id and order_id = p_order_id
    ) then
      raise exception 'Sản phẩm không thuộc đơn hàng.';
    end if;
  end loop;

  -- Xóa các dòng đã bị bỏ khỏi đơn. Trigger v27 tự hoàn tồn.
  delete from public.order_items
   where order_id = p_order_id
     and id <> all (v_ids);

  -- Cập nhật giá bán của các dòng còn lại (số lượng giữ nguyên).
  for v_item in select value from jsonb_array_elements(p_items) loop
    update public.order_items
       set price = (v_item->>'price')::numeric,
           total = (v_item->>'price')::numeric * qty
     where id = (v_item->>'id')::uuid
       and order_id = p_order_id;
  end loop;

  select coalesce(sum(total), 0)
    into v_merch
    from public.order_items
   where order_id = p_order_id;

  v_discount := greatest(0, coalesce(p_discount, v_order.discount, 0));
  if v_discount > v_merch then
    raise exception 'Chiết khấu không được lớn hơn tiền hàng.';
  end if;

  v_total := coalesce(p_total, v_order.total, 0);
  if v_total < 0 or v_total >= 1e13 then
    raise exception 'Tổng tiền không hợp lệ.';
  end if;
  if v_total < v_merch - v_discount then
    raise exception 'Tổng tiền nhỏ hơn tiền hàng sau chiết khấu.';
  end if;

  update public.orders
     set total = v_total,
         discount = v_discount
   where id = p_order_id
   returning * into v_order;

  -- Đơn đã thu tiền: giữ khoản thu khớp với tổng mới để báo cáo không lệch.
  if p_adjust_income and v_order.paid and v_total <> v_old_total then
    v_delta := v_total - v_old_total;
    select * into v_income
      from public.transactions
     where shop_id = p_shop
       and order_id = p_order_id
       and type = 'income'
     order by occurred_at asc, created_at asc
     limit 1
     for update;
    if found then
      -- Chỉ mở khóa đúng giao dịch thu của đơn này trong transaction hiện tại.
      perform set_config('piopio.allow_order_tx', v_income.id::text, true);
      if coalesce(v_income.amount, 0) + v_delta <= 0 then
        delete from public.transactions where id = v_income.id;
      else
        update public.transactions
           set amount = coalesce(v_income.amount, 0) + v_delta
         where id = v_income.id;
      end if;
      perform set_config('piopio.allow_order_tx', '', true);
    end if;
  end if;

  return to_jsonb(v_order);
end;
$$;

revoke all on function public.inv_update_order(uuid, uuid, jsonb, numeric, numeric, boolean) from public;
grant execute on function public.inv_update_order(uuid, uuid, jsonb, numeric, numeric, boolean) to authenticated;

-- Nạp lại schema cache của PostgREST để gọi RPC được ngay.
notify pgrst, 'reload schema';

-- ============================================================================
-- PioPio v45 — Cho phép nhiều chi nhánh khách hàng dùng chung SĐT
--
-- Chạy SAU v44. An toàn khi chạy lại (idempotent).
--
-- Một khách hàng/doanh nghiệp có thể có nhiều cửa hàng hoặc chi nhánh, mỗi
-- chi nhánh cần một hồ sơ, địa chỉ và công nợ riêng nhưng dùng chung SĐT liên
-- hệ. SĐT vẫn được chuẩn hóa để tìm kiếm và công cụ "Lọc khách trùng" gợi ý;
-- chỉ bỏ việc dùng SĐT như khóa duy nhất bắt buộc.
-- ============================================================================

begin;

-- Không xóa hay gộp dữ liệu. Chỉ bỏ ràng buộc duy nhất theo (shop, phone).
drop index if exists public.customers_crm_phone_unique;

create or replace function public.crm_create_customer(p_shop uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.customers%rowtype;
begin
  if not public.is_shop_member(p_shop) then
    raise exception 'Không có quyền tạo khách hàng.';
  end if;

  insert into public.customers(
    shop_id, name, code, phone, email, address, dob, gender, avatar_url,
    customer_group_id, status, debt, tags, important, created_by
  ) values (
    p_shop, p_input->>'name', nullif(p_input->>'code', ''),
    nullif(p_input->>'phone', ''), nullif(p_input->>'email', ''),
    nullif(p_input->>'address', ''), nullif(p_input->>'dob', '')::date,
    nullif(p_input->>'gender', ''), nullif(p_input->>'avatar_url', ''),
    nullif(p_input->>'customer_group_id', '')::uuid,
    coalesce(nullif(p_input->>'status', ''), 'active'),
    coalesce((p_input->>'debt')::numeric, 0),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_input->'tags', '[]'))), '{}'),
    coalesce((p_input->>'important')::boolean, false), auth.uid()
  ) returning * into v;

  return to_jsonb(v);
end;
$$;

create or replace function public.crm_update_customer(
  p_shop uuid, p_customer_id uuid, p_input jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.customers%rowtype;
  v_old public.customers%rowtype;
  v_name text;
begin
  if not public.is_shop_member(p_shop) then
    raise exception 'Không có quyền sửa khách hàng.';
  end if;

  select * into v_old
    from public.customers
   where id = p_customer_id and shop_id = p_shop and deleted_at is null
   for update;
  if not found then raise exception 'Không tìm thấy khách hàng.'; end if;

  update public.customers c set
    name = case when p_input ? 'name' then p_input->>'name' else c.name end,
    code = case when p_input ? 'code' then nullif(p_input->>'code', '') else c.code end,
    phone = case when p_input ? 'phone' then nullif(p_input->>'phone', '') else c.phone end,
    email = case when p_input ? 'email' then nullif(p_input->>'email', '') else c.email end,
    address = case when p_input ? 'address' then nullif(p_input->>'address', '') else c.address end,
    dob = case when p_input ? 'dob' then nullif(p_input->>'dob', '')::date else c.dob end,
    gender = case when p_input ? 'gender' then nullif(p_input->>'gender', '') else c.gender end,
    avatar_url = case when p_input ? 'avatar_url' then nullif(p_input->>'avatar_url', '') else c.avatar_url end,
    customer_group_id = case when p_input ? 'customer_group_id' then nullif(p_input->>'customer_group_id', '')::uuid else c.customer_group_id end,
    status = case when p_input ? 'status' then p_input->>'status' else c.status end,
    debt = case when p_input ? 'debt' then (p_input->>'debt')::numeric else c.debt end,
    tags = case when p_input ? 'tags' then array(select jsonb_array_elements_text(p_input->'tags')) else c.tags end,
    important = case when p_input ? 'important' then (p_input->>'important')::boolean else c.important end
  where c.id = p_customer_id and c.shop_id = p_shop and c.deleted_at is null
  returning * into v;

  if p_input ? 'debt' and v.debt <> v_old.debt then
    insert into public.customer_debt_ledger(
      shop_id, customer_id, type, amount, balance_after, note, created_by
    ) values (
      p_shop, p_customer_id, 'adjustment', abs(v.debt - v_old.debt), v.debt,
      'Điều chỉnh từ hồ sơ khách hàng', auth.uid()
    );
  end if;

  if v.status is distinct from v_old.status
     or v.customer_group_id is distinct from v_old.customer_group_id then
    select full_name into v_name from public.profiles where id = auth.uid();
    insert into public.customer_interactions(
      shop_id, customer_id, type, content, metadata, created_by, created_by_name
    ) values (
      p_shop, p_customer_id, 'system', 'Đã cập nhật phân loại/trạng thái khách hàng',
      jsonb_build_object('status', v.status, 'groupId', v.customer_group_id),
      auth.uid(), v_name
    );
  end if;

  return to_jsonb(v);
end;
$$;

revoke all on function public.crm_create_customer(uuid,jsonb) from public, anon;
revoke all on function public.crm_update_customer(uuid,uuid,jsonb) from public, anon;
grant execute on function public.crm_create_customer(uuid,jsonb) to authenticated, service_role;
grant execute on function public.crm_update_customer(uuid,uuid,jsonb) to authenticated, service_role;

insert into public.piopio_migrations(id) values ('v45_customer_shared_phone')
on conflict (id) do nothing;

notify pgrst, 'reload schema';

commit;


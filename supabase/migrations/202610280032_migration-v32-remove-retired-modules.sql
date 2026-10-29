-- ============================================================================
-- PioPio v32 — Remove retired modules
-- Removes ONLY: staff management UI data extensions, sales routes, loyalty
-- points/tiers, shifts, and the dedicated lead pipeline view.
-- Core profiles/auth/permissions and CRM lead records are intentionally kept.
-- Run after the earlier migrations in Supabase Dashboard > SQL Editor.
-- ============================================================================

begin;

-- Remove the legacy overload before dropping columns referenced by its body.
drop function if exists public.crm_list_customers(
  uuid, text, numeric, uuid, uuid, text, text, date, date, boolean,
  text, text, integer, integer
);

-- Loyalty/points data and configuration.
drop table if exists public.point_transactions cascade;
drop table if exists public.point_configs cascade;
drop table if exists public.loyalty_tiers cascade;

-- Shift management.
drop table if exists public.shifts cascade;

-- Sales routes must be detached from customers before the route table is removed.
alter table if exists public.customers drop column if exists route_id;
drop table if exists public.sales_routes cascade;

-- Fields that belonged only to retired loyalty/staff-assignment modules.
alter table if exists public.customers
  drop column if exists points,
  drop column if exists tier,
  drop column if exists assigned_to;

-- Remove retired feature switches without assuming that settings exists.
do $$
begin
  if to_regclass('public.settings') is not null then
    delete from public.settings
    where key in ('point_rate', 'enable_shift_close', 'show_staff_phone', 'show_staff_sign');
  end if;
end $$;

-- Current customer-list API without route, loyalty or staff-assignment filters.
drop function if exists public.crm_list_customers(
  uuid, text, numeric, uuid, text, date, date, boolean,
  text, text, integer, integer
);

create function public.crm_list_customers(
  p_shop uuid, p_q text default null, p_debt_min numeric default null,
  p_group_id uuid default null, p_status text default null,
  p_created_from date default null, p_created_to date default null,
  p_important boolean default null, p_sort_by text default 'created_at',
  p_sort_direction text default 'desc', p_page int default 1,
  p_page_size int default 20
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_offset int := greatest(p_page - 1, 0) * least(greatest(p_page_size, 1), 100);
  v_limit int := least(greatest(p_page_size, 1), 100);
  v_total bigint;
  v_items jsonb;
begin
  if not public.is_shop_member(p_shop) then
    raise exception 'Không có quyền truy cập cửa hàng.';
  end if;

  with filtered as (
    select c.*, g.name as customer_group_name
    from public.customers c
    left join public.customer_groups g on g.id = c.customer_group_id
    where c.shop_id = p_shop
      and c.deleted_at is null
      and (
        p_q is null
        or c.search_vector @@ websearch_to_tsquery('simple', p_q)
        or c.name ilike '%' || p_q || '%'
        or (
          nullif(regexp_replace(p_q, '[^0-9]', '', 'g'), '') is not null
          and c.phone_normalized like '%' || regexp_replace(p_q, '[^0-9]', '', 'g') || '%'
        )
      )
      and (p_debt_min is null or c.debt >= p_debt_min)
      and (p_group_id is null or c.customer_group_id = p_group_id)
      and (p_status is null or c.status = p_status)
      and (p_created_from is null or c.created_at >= p_created_from)
      and (p_created_to is null or c.created_at < p_created_to + 1)
      and (p_important is null or c.important = p_important)
  ), counted as (
    select count(*) as n from filtered
  ), paged as (
    select * from filtered
    order by
      case when p_sort_by = 'name' and p_sort_direction = 'asc' then name end asc,
      case when p_sort_by = 'name' and p_sort_direction = 'desc' then name end desc,
      case when p_sort_by = 'debt' and p_sort_direction = 'asc' then debt end asc,
      case when p_sort_by = 'debt' and p_sort_direction = 'desc' then debt end desc,
      case when p_sort_by = 'total_spending' and p_sort_direction = 'asc' then total_spending end asc,
      case when p_sort_by = 'total_spending' and p_sort_direction = 'desc' then total_spending end desc,
      case when p_sort_by = 'last_activity' and p_sort_direction = 'asc' then last_activity end asc nulls last,
      case when p_sort_by = 'last_activity' and p_sort_direction = 'desc' then last_activity end desc nulls last,
      case when p_sort_direction = 'asc' then created_at end asc,
      case when p_sort_direction <> 'asc' then created_at end desc
    limit v_limit offset v_offset
  )
  select (select n from counted), coalesce(jsonb_agg(to_jsonb(paged)), '[]')
  into v_total, v_items
  from paged;

  return jsonb_build_object(
    'items', coalesce(v_items, '[]'), 'total', coalesce(v_total, 0),
    'page', greatest(p_page, 1), 'pageSize', v_limit
  );
end $$;

create or replace function public.crm_create_customer(p_shop uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.customers%rowtype;
  v_phone text := nullif(regexp_replace(coalesce(p_input->>'phone', ''), '[^0-9]', '', 'g'), '');
begin
  if not public.is_shop_member(p_shop) then
    raise exception 'Không có quyền tạo khách hàng.';
  end if;
  if v_phone is not null and exists (
    select 1 from public.customers
    where shop_id = p_shop and phone_normalized = v_phone and deleted_at is null
  ) then
    raise exception 'Số điện thoại đã tồn tại trong hệ thống.' using errcode = '23505';
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
end $$;

create or replace function public.crm_update_customer(
  p_shop uuid, p_customer_id uuid, p_input jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.customers%rowtype;
  v_old public.customers%rowtype;
  v_phone text;
  v_name text;
begin
  if not public.is_shop_member(p_shop) then
    raise exception 'Không có quyền sửa khách hàng.';
  end if;
  select * into v_old from public.customers
  where id = p_customer_id and shop_id = p_shop and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy khách hàng.'; end if;

  v_phone := case when p_input ? 'phone'
    then nullif(regexp_replace(coalesce(p_input->>'phone', ''), '[^0-9]', '', 'g'), '')
    else null end;
  if p_input ? 'phone' and v_phone is not null and exists (
    select 1 from public.customers
    where shop_id = p_shop and phone_normalized = v_phone
      and id <> p_customer_id and deleted_at is null
  ) then
    raise exception 'Số điện thoại đã tồn tại trong hệ thống.' using errcode = '23505';
  end if;

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
      jsonb_build_object('status', v.status, 'groupId', v.customer_group_id), auth.uid(), v_name
    );
  end if;
  return to_jsonb(v);
end $$;

commit;

-- ============================================================================
-- PioPio v31 — Customer CRM 360° (idempotent, additive)
-- Run manually in Supabase Dashboard > SQL Editor before enabling CRM writes.
-- ============================================================================
create extension if not exists pg_trgm;

create table if not exists public.customer_groups (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  color text not null default '#6030FF',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, name)
);

alter table public.customers
  add column if not exists dob date,
  add column if not exists avatar_url text,
  add column if not exists customer_group_id uuid references public.customer_groups(id) on delete set null,
  add column if not exists status text not null default 'active',
  add column if not exists total_spending numeric(16,2) not null default 0,
  add column if not exists tier text not null default 'bronze',
  add column if not exists created_by uuid,
  add column if not exists assigned_to uuid,
  add column if not exists tags text[] not null default '{}',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add column if not exists phone_normalized text,
  add column if not exists search_vector tsvector;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'customers_crm_status_check') then
    alter table public.customers add constraint customers_crm_status_check check (status in ('lead','active','inactive')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'customers_crm_tier_check') then
    alter table public.customers add constraint customers_crm_tier_check check (tier in ('bronze','silver','gold')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'customers_crm_money_check') then
    alter table public.customers add constraint customers_crm_money_check check (debt >= 0 and total_spending >= 0) not valid;
  end if;
end $$;

create table if not exists public.customer_interactions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  type text not null check (type in ('note','call','email','system','visit')),
  content text not null check (length(btrim(content)) between 1 and 5000),
  metadata jsonb not null default '{}',
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_debt_ledger (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  type text not null check (type in ('charge','payment','adjustment')),
  amount numeric(16,2) not null check (amount > 0),
  balance_after numeric(16,2) not null check (balance_after >= 0),
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_attachments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  file_name text not null,
  file_path text not null unique,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes between 0 and 10485760),
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists customers_crm_active_idx on public.customers(shop_id, created_at desc) where deleted_at is null;
create index if not exists customers_crm_debt_idx on public.customers(shop_id, debt desc) where deleted_at is null and debt > 0;
create index if not exists customers_crm_assigned_idx on public.customers(shop_id, assigned_to) where deleted_at is null;
create index if not exists customers_crm_group_idx on public.customers(shop_id, customer_group_id) where deleted_at is null;
create index if not exists customers_crm_search_idx on public.customers using gin(search_vector);
create index if not exists customers_crm_name_trgm_idx on public.customers using gin(name gin_trgm_ops);
create index if not exists customer_interactions_customer_idx on public.customer_interactions(customer_id, created_at desc);
create index if not exists customer_debt_ledger_customer_idx on public.customer_debt_ledger(customer_id, created_at desc);
create index if not exists customer_attachments_customer_idx on public.customer_attachments(customer_id, created_at desc);

create or replace function public.crm_prepare_customer()
returns trigger language plpgsql set search_path = public as $$
declare v_num bigint;
begin
  new.name := btrim(new.name);
  if length(new.name) < 2 or length(new.name) > 160 then raise exception 'Họ tên phải từ 2 đến 160 ký tự.'; end if;
  new.phone := nullif(btrim(coalesce(new.phone,'')), '');
  new.phone_normalized := nullif(regexp_replace(coalesce(new.phone,''), '[^0-9]', '', 'g'), '');
  if new.phone_normalized is not null and length(new.phone_normalized) not between 8 and 15 then raise exception 'Số điện thoại không hợp lệ.'; end if;
  if new.email is not null and new.email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Email không hợp lệ.'; end if;
  if new.code is null or btrim(new.code) = '' then
    perform pg_advisory_xact_lock(hashtextextended('customer-code:' || new.shop_id::text, 0));
    select coalesce(max(nullif(regexp_replace(code, '[^0-9]', '', 'g'),'')::bigint),0)+1 into v_num from public.customers where shop_id = new.shop_id;
    new.code := 'CUST' || lpad(v_num::text, 3, '0');
  end if;
  new.updated_at := now();
  new.search_vector := setweight(to_tsvector('simple', coalesce(new.name,'')), 'A') || setweight(to_tsvector('simple', coalesce(new.phone_normalized,'')), 'A') || setweight(to_tsvector('simple', coalesce(new.code,'')), 'B') || setweight(to_tsvector('simple', coalesce(new.email,'')), 'C');
  return new;
end $$;

drop trigger if exists crm_prepare_customer_trigger on public.customers;
create trigger crm_prepare_customer_trigger before insert or update on public.customers for each row execute function public.crm_prepare_customer();
update public.customers set updated_at = coalesce(updated_at, created_at, now());

do $$ begin
  if not exists (select 1 from public.customers where deleted_at is null and phone_normalized is not null group by shop_id, phone_normalized having count(*) > 1) then
    create unique index if not exists customers_crm_phone_unique on public.customers(shop_id, phone_normalized) where deleted_at is null and phone_normalized is not null;
  else
    raise notice 'Phone duplicates exist; unique index skipped. Use the duplicate-customer tool, then rerun v31.';
  end if;
end $$;

create or replace function public.crm_list_customers(
  p_shop uuid, p_q text default null, p_debt_min numeric default null, p_group_id uuid default null,
  p_assigned_to uuid default null, p_status text default null, p_tier text default null,
  p_created_from date default null, p_created_to date default null, p_important boolean default null,
  p_sort_by text default 'created_at', p_sort_direction text default 'desc', p_page int default 1, p_page_size int default 20
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_offset int := greatest(p_page-1,0) * least(greatest(p_page_size,1),100); v_limit int := least(greatest(p_page_size,1),100); v_total bigint; v_items jsonb;
begin
  if not public.is_shop_member(p_shop) then raise exception 'Không có quyền truy cập cửa hàng.'; end if;
  with filtered as (
    select c.*, g.name customer_group_name, p.full_name assigned_to_name
    from public.customers c left join public.customer_groups g on g.id=c.customer_group_id left join public.profiles p on p.id=c.assigned_to
    where c.shop_id=p_shop and c.deleted_at is null
      and (p_q is null or c.search_vector @@ websearch_to_tsquery('simple', p_q) or c.name ilike '%'||p_q||'%'
        or (nullif(regexp_replace(p_q,'[^0-9]','','g'),'') is not null and c.phone_normalized like '%'||regexp_replace(p_q,'[^0-9]','','g')||'%'))
      and (p_debt_min is null or c.debt >= p_debt_min) and (p_group_id is null or c.customer_group_id=p_group_id)
      and (p_assigned_to is null or c.assigned_to=p_assigned_to) and (p_status is null or c.status=p_status)
      and (p_tier is null or c.tier=p_tier) and (p_created_from is null or c.created_at>=p_created_from)
      and (p_created_to is null or c.created_at<p_created_to+1) and (p_important is null or c.important=p_important)
  ), counted as (select count(*) n from filtered), paged as (
    select * from filtered order by
      case when p_sort_by='name' and p_sort_direction='asc' then name end asc,
      case when p_sort_by='name' and p_sort_direction='desc' then name end desc,
      case when p_sort_by='debt' and p_sort_direction='asc' then debt end asc,
      case when p_sort_by='debt' and p_sort_direction='desc' then debt end desc,
      case when p_sort_by='total_spending' and p_sort_direction='asc' then total_spending end asc,
      case when p_sort_by='total_spending' and p_sort_direction='desc' then total_spending end desc,
      case when p_sort_by='last_activity' and p_sort_direction='asc' then last_activity end asc nulls last,
      case when p_sort_by='last_activity' and p_sort_direction='desc' then last_activity end desc nulls last,
      case when p_sort_direction='asc' then created_at end asc,
      case when p_sort_direction<>'asc' then created_at end desc
    limit v_limit offset v_offset
  ) select (select n from counted), coalesce(jsonb_agg(to_jsonb(paged)),'[]') into v_total,v_items from paged;
  return jsonb_build_object('items',coalesce(v_items,'[]'),'total',coalesce(v_total,0),'page',greatest(p_page,1),'pageSize',v_limit);
end $$;

create or replace function public.crm_create_customer(p_shop uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.customers%rowtype; v_phone text := nullif(regexp_replace(coalesce(p_input->>'phone',''),'[^0-9]','','g'),'');
begin
  if not public.is_shop_member(p_shop) then raise exception 'Không có quyền tạo khách hàng.'; end if;
  if v_phone is not null and exists(select 1 from public.customers where shop_id=p_shop and phone_normalized=v_phone and deleted_at is null) then raise exception 'Số điện thoại đã tồn tại trong hệ thống.' using errcode='23505'; end if;
  insert into public.customers(shop_id,name,code,phone,email,address,dob,gender,avatar_url,customer_group_id,status,debt,points,tier,assigned_to,tags,important,route_id,created_by)
  values(p_shop,p_input->>'name',nullif(p_input->>'code',''),nullif(p_input->>'phone',''),nullif(p_input->>'email',''),nullif(p_input->>'address',''),nullif(p_input->>'dob','')::date,nullif(p_input->>'gender',''),nullif(p_input->>'avatar_url',''),nullif(p_input->>'customer_group_id','')::uuid,coalesce(nullif(p_input->>'status',''),'active'),coalesce((p_input->>'debt')::numeric,0),coalesce((p_input->>'points')::numeric,0),coalesce(nullif(p_input->>'tier',''),'bronze'),nullif(p_input->>'assigned_to','')::uuid,coalesce(array(select jsonb_array_elements_text(coalesce(p_input->'tags','[]'))),'{}'),coalesce((p_input->>'important')::boolean,false),nullif(p_input->>'route_id','')::uuid,auth.uid()) returning * into v;
  return to_jsonb(v);
end $$;

create or replace function public.crm_update_customer(p_shop uuid, p_customer_id uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.customers%rowtype; v_old public.customers%rowtype; v_phone text; v_name text;
begin
  if not public.is_shop_member(p_shop) then raise exception 'Không có quyền sửa khách hàng.'; end if;
  select * into v_old from public.customers where id=p_customer_id and shop_id=p_shop and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy khách hàng.'; end if;
  v_phone := case when p_input ? 'phone' then nullif(regexp_replace(coalesce(p_input->>'phone',''),'[^0-9]','','g'),'') else null end;
  if p_input ? 'phone' and v_phone is not null and exists(select 1 from public.customers where shop_id=p_shop and phone_normalized=v_phone and id<>p_customer_id and deleted_at is null) then raise exception 'Số điện thoại đã tồn tại trong hệ thống.' using errcode='23505'; end if;
  update public.customers c set
    name=case when p_input?'name' then p_input->>'name' else c.name end, code=case when p_input?'code' then nullif(p_input->>'code','') else c.code end,
    phone=case when p_input?'phone' then nullif(p_input->>'phone','') else c.phone end, email=case when p_input?'email' then nullif(p_input->>'email','') else c.email end,
    address=case when p_input?'address' then nullif(p_input->>'address','') else c.address end, dob=case when p_input?'dob' then nullif(p_input->>'dob','')::date else c.dob end,
    gender=case when p_input?'gender' then nullif(p_input->>'gender','') else c.gender end, avatar_url=case when p_input?'avatar_url' then nullif(p_input->>'avatar_url','') else c.avatar_url end,
    customer_group_id=case when p_input?'customer_group_id' then nullif(p_input->>'customer_group_id','')::uuid else c.customer_group_id end,
    status=case when p_input?'status' then p_input->>'status' else c.status end, debt=case when p_input?'debt' then (p_input->>'debt')::numeric else c.debt end,
    points=case when p_input?'points' then (p_input->>'points')::numeric else c.points end, tier=case when p_input?'tier' then p_input->>'tier' else c.tier end,
    assigned_to=case when p_input?'assigned_to' then nullif(p_input->>'assigned_to','')::uuid else c.assigned_to end,
    tags=case when p_input?'tags' then array(select jsonb_array_elements_text(p_input->'tags')) else c.tags end,
    important=case when p_input?'important' then (p_input->>'important')::boolean else c.important end,
    route_id=case when p_input?'route_id' then nullif(p_input->>'route_id','')::uuid else c.route_id end
  where c.id=p_customer_id and c.shop_id=p_shop and c.deleted_at is null returning * into v;
  if p_input ? 'debt' and v.debt <> v_old.debt then
    insert into public.customer_debt_ledger(shop_id,customer_id,type,amount,balance_after,note,created_by)
    values(p_shop,p_customer_id,'adjustment',abs(v.debt-v_old.debt),v.debt,'Điều chỉnh từ hồ sơ khách hàng',auth.uid());
  end if;
  if v.status is distinct from v_old.status or v.tier is distinct from v_old.tier or v.customer_group_id is distinct from v_old.customer_group_id then
    select full_name into v_name from public.profiles where id=auth.uid();
    insert into public.customer_interactions(shop_id,customer_id,type,content,metadata,created_by,created_by_name)
    values(p_shop,p_customer_id,'system','Đã cập nhật phân loại/trạng thái khách hàng',jsonb_build_object('status',v.status,'tier',v.tier,'groupId',v.customer_group_id),auth.uid(),v_name);
  end if;
  return to_jsonb(v);
end $$;

create or replace function public.crm_soft_delete_customer(p_shop uuid,p_customer_id uuid)
returns void language plpgsql security definer set search_path=public as $$ begin
  if not public.is_shop_member(p_shop) then raise exception 'Không có quyền xóa khách hàng.'; end if;
  update public.customers set deleted_at=now(),status='inactive' where id=p_customer_id and shop_id=p_shop and deleted_at is null;
end $$;

create or replace function public.crm_add_customer_interaction(p_shop uuid,p_customer_id uuid,p_type text,p_content text,p_metadata jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.customer_interactions%rowtype; v_name text;
begin
  if not public.is_shop_member(p_shop) then raise exception 'Không có quyền.'; end if;
  if p_type not in ('note','call','email','system','visit') then raise exception 'Loại tương tác không hợp lệ.'; end if;
  if length(btrim(coalesce(p_content,''))) not between 1 and 5000 then raise exception 'Nội dung phải từ 1 đến 5.000 ký tự.'; end if;
  if not exists(select 1 from public.customers where id=p_customer_id and shop_id=p_shop and deleted_at is null) then raise exception 'Không tìm thấy khách hàng.'; end if;
  select full_name into v_name from public.profiles where id=auth.uid();
  insert into public.customer_interactions(shop_id,customer_id,type,content,metadata,created_by,created_by_name) values(p_shop,p_customer_id,p_type,btrim(p_content),coalesce(p_metadata,'{}'),auth.uid(),v_name) returning * into v;
  update public.customers set last_activity=now() where id=p_customer_id; return to_jsonb(v);
end $$;

create or replace function public.crm_adjust_customer_debt(p_shop uuid,p_customer_id uuid,p_type text,p_amount numeric,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_customer public.customers%rowtype; v_balance numeric;
begin
  if not public.is_shop_member(p_shop) then raise exception 'Không có quyền cập nhật công nợ.'; end if;
  if p_type not in ('charge','payment','adjustment') or p_amount<=0 then raise exception 'Dữ liệu công nợ không hợp lệ.'; end if;
  select * into v_customer from public.customers where id=p_customer_id and shop_id=p_shop and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy khách hàng.'; end if;
  v_balance := case when p_type='payment' then greatest(0,v_customer.debt-p_amount) else v_customer.debt+p_amount end;
  update public.customers set debt=v_balance,last_activity=now() where id=p_customer_id;
  insert into public.customer_debt_ledger(shop_id,customer_id,type,amount,balance_after,note,created_by) values(p_shop,p_customer_id,p_type,p_amount,v_balance,p_note,auth.uid());
  if p_type='payment' then insert into public.transactions(shop_id,type,category,amount,note,occurred_at) values(p_shop,'income','Thu nợ',p_amount,coalesce(p_note,'Thu nợ từ '||v_customer.name),now()); end if;
  return jsonb_build_object('balance',v_balance);
end $$;

create or replace function public.crm_refresh_customer_spending()
returns trigger language plpgsql set search_path=public as $$
declare v_customer uuid; v_shop uuid;
begin
  if tg_op = 'DELETE' then v_customer := old.customer_id; v_shop := old.shop_id;
  else v_customer := new.customer_id; v_shop := new.shop_id; end if;
  if v_customer is not null then update public.customers set total_spending=(select coalesce(sum(total),0) from public.orders where shop_id=v_shop and customer_id=v_customer and status<>'cancelled'),last_activity=now() where id=v_customer; end if;
  if tg_op = 'DELETE' then return old; end if; return new;
end $$;
drop trigger if exists crm_order_customer_totals on public.orders;
create trigger crm_order_customer_totals after insert or update or delete on public.orders for each row execute function public.crm_refresh_customer_spending();

alter table public.customer_groups enable row level security;
alter table public.customer_interactions enable row level security;
alter table public.customer_debt_ledger enable row level security;
alter table public.customer_attachments enable row level security;
do $$ declare t text; begin foreach t in array array['customer_groups','customer_interactions','customer_debt_ledger','customer_attachments'] loop
  execute format('drop policy if exists "shop member all" on public.%I',t);
  execute format('create policy "shop member all" on public.%I for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id))',t);
end loop; end $$;

insert into storage.buckets(id,name,public,file_size_limit) values('customer-files','customer-files',false,10485760) on conflict(id) do update set file_size_limit=excluded.file_size_limit;
drop policy if exists "customer files member read" on storage.objects;
drop policy if exists "customer files member write" on storage.objects;
create policy "customer files member read" on storage.objects for select using(bucket_id='customer-files' and public.is_shop_member(((storage.foldername(name))[1])::uuid));
create policy "customer files member write" on storage.objects for all using(bucket_id='customer-files' and public.is_shop_member(((storage.foldername(name))[1])::uuid)) with check(bucket_id='customer-files' and public.is_shop_member(((storage.foldername(name))[1])::uuid));

grant execute on function public.crm_list_customers(uuid,text,numeric,uuid,uuid,text,text,date,date,boolean,text,text,int,int) to authenticated;
grant execute on function public.crm_create_customer(uuid,jsonb) to authenticated;
grant execute on function public.crm_update_customer(uuid,uuid,jsonb) to authenticated;
grant execute on function public.crm_soft_delete_customer(uuid,uuid) to authenticated;
grant execute on function public.crm_add_customer_interaction(uuid,uuid,text,text,jsonb) to authenticated;
grant execute on function public.crm_adjust_customer_debt(uuid,uuid,text,numeric,text) to authenticated;

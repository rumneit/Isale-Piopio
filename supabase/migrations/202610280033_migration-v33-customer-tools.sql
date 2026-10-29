-- ============================================================================
-- PioPio v33 — Notes with private images + safe customer import/merge
-- Run after v31 and v32 in Supabase Dashboard > SQL Editor.
-- ============================================================================

begin;

alter table public.notes
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists important boolean not null default false,
  add column if not exists recurring boolean not null default false,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid;

create index if not exists notes_customer_idx on public.notes(shop_id, customer_id, created_at desc);

create table if not exists public.note_images (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  note_id uuid not null references public.notes(id) on delete cascade,
  file_name text not null,
  file_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/gif')),
  size_bytes bigint not null check (size_bytes between 1 and 8388608),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists note_images_note_idx on public.note_images(note_id, sort_order, created_at);
alter table public.note_images enable row level security;
drop policy if exists "note images member all" on public.note_images;
create policy "note images member all" on public.note_images for all
  using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

create or replace function public.note_image_validate() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.notes where id=new.note_id and shop_id=new.shop_id) then
    raise exception 'Ghi chú không thuộc cửa hàng hiện tại.';
  end if;
  if (select count(*) from public.note_images where note_id=new.note_id) >= 10 then
    raise exception 'Mỗi ghi chú chỉ được tối đa 10 ảnh.';
  end if;
  return new;
end $$;
drop trigger if exists note_image_validate_trigger on public.note_images;
create trigger note_image_validate_trigger before insert on public.note_images
for each row execute function public.note_image_validate();

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('note-images', 'note-images', false, 8388608, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "note images storage read" on storage.objects;
drop policy if exists "note images storage write" on storage.objects;
create policy "note images storage read" on storage.objects for select
  using (bucket_id = 'note-images' and public.is_shop_member(((storage.foldername(name))[1])::uuid));
create policy "note images storage write" on storage.objects for all
  using (bucket_id = 'note-images' and public.is_shop_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'note-images' and public.is_shop_member(((storage.foldername(name))[1])::uuid));

create table if not exists public.customer_import_jobs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  idempotency_key uuid not null,
  source_name text,
  result jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(shop_id, idempotency_key)
);
alter table public.customer_import_jobs enable row level security;
drop policy if exists "customer import jobs member all" on public.customer_import_jobs;
create policy "customer import jobs member all" on public.customer_import_jobs for all
  using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

create or replace function public.crm_phone_key(p_phone text) returns text
language sql immutable as $$
  select case
    when regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') ~ '^84[0-9]{8,10}$'
      then '0' || substr(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),3)
    else nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),'')
  end
$$;

create or replace function public.crm_import_customers(
  p_shop uuid,
  p_rows jsonb,
  p_strategy text default 'skip',
  p_idempotency_key uuid default gen_random_uuid(),
  p_source_name text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_existing_result jsonb;
  v_result jsonb;
  v_row jsonb;
  v_customer public.customers%rowtype;
  v_row_number int := 1;
  v_created int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_phone text;
  v_email text;
  v_code text;
begin
  if not public.is_shop_member(p_shop) then raise exception 'Không có quyền nhập khách hàng.'; end if;
  if p_strategy not in ('skip','update') then raise exception 'Chiến lược xử lý trùng không hợp lệ.'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Dữ liệu nhập phải là một mảng.'; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'Mỗi lần chỉ được nhập tối đa 2.000 dòng.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('customer-import:' || p_shop::text || ':' || p_idempotency_key::text, 0));

  select result into v_existing_result from public.customer_import_jobs
  where shop_id = p_shop and idempotency_key = p_idempotency_key;
  if found and v_existing_result is not null then return v_existing_result; end if;

  insert into public.customer_import_jobs(shop_id,idempotency_key,source_name,created_by)
  values(p_shop,p_idempotency_key,p_source_name,auth.uid())
  on conflict(shop_id,idempotency_key) do nothing;

  for v_row in
    select row_item from jsonb_array_elements(p_rows) as import_rows(row_item)
  loop
    begin
      v_row_number := coalesce((v_row->>'rowNumber')::int, v_row_number);
      if length(btrim(coalesce(v_row->>'name',''))) < 2 then
        raise exception 'Họ tên phải có ít nhất 2 ký tự.';
      end if;
      v_phone := public.crm_phone_key(v_row->>'phone');
      v_email := nullif(lower(btrim(coalesce(v_row->>'email',''))),'');
      v_code := nullif(btrim(coalesce(v_row->>'code','')),'');

      select * into v_customer from public.customers
      where shop_id = p_shop and deleted_at is null and (
        (v_phone is not null and public.crm_phone_key(phone) = v_phone)
        or (v_email is not null and lower(email) = v_email)
        or (v_code is not null and code = v_code)
      ) order by created_at limit 1 for update;

      if found and p_strategy = 'skip' then
        v_skipped := v_skipped + 1;
      elsif found then
        update public.customers c set
          name = coalesce(nullif(btrim(v_row->>'name'),''), c.name),
          phone = coalesce(nullif(btrim(v_row->>'phone'),''), c.phone),
          email = coalesce(nullif(btrim(v_row->>'email'),''), c.email),
          address = coalesce(nullif(btrim(v_row->>'address'),''), c.address),
          gender = coalesce(nullif(btrim(v_row->>'gender'),''), c.gender),
          dob = coalesce(nullif(v_row->>'dob','')::date, c.dob),
          important = case when v_row ? 'important' then coalesce((v_row->>'important')::boolean,false) else c.important end,
          updated_at = now()
        where c.id = v_customer.id;
        v_updated := v_updated + 1;
      else
        insert into public.customers(shop_id,name,code,phone,email,address,gender,dob,important,debt,created_by)
        values(p_shop,btrim(v_row->>'name'),v_code,nullif(btrim(v_row->>'phone'),''),nullif(btrim(v_row->>'email'),''),
          nullif(btrim(v_row->>'address'),''),nullif(btrim(v_row->>'gender'),''),nullif(v_row->>'dob','')::date,
          coalesce((v_row->>'important')::boolean,false),0,auth.uid());
        v_created := v_created + 1;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('row',v_row_number,'message',sqlerrm));
    end;
    v_row_number := v_row_number + 1;
  end loop;

  v_result := jsonb_build_object(
    'created',v_created,'updated',v_updated,'skipped',v_skipped,
    'failed',jsonb_array_length(v_errors),'errors',v_errors
  );
  update public.customer_import_jobs set result = v_result
  where shop_id = p_shop and idempotency_key = p_idempotency_key;
  return v_result;
end $$;

create or replace function public.crm_merge_customers(
  p_shop uuid,
  p_primary_id uuid,
  p_duplicate_ids uuid[],
  p_expected_updated_at jsonb,
  p_patch jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_expected timestamptz;
  v_primary public.customers%rowtype;
  v_merged int := 0;
  v_total_debt numeric := 0;
begin
  if not public.is_shop_member(p_shop) then raise exception 'Không có quyền hợp nhất khách hàng.'; end if;
  if p_primary_id = any(p_duplicate_ids) then raise exception 'Bản ghi chính không được nằm trong danh sách hợp nhất.'; end if;
  if coalesce(array_length(p_duplicate_ids,1),0) = 0 then raise exception 'Chưa chọn bản ghi cần hợp nhất.'; end if;
  if exists(select 1 from unnest(p_duplicate_ids) as x group by x having count(*) > 1) then
    raise exception 'Danh sách hợp nhất chứa bản ghi lặp.';
  end if;

  select * into v_primary from public.customers
  where id = p_primary_id and shop_id = p_shop and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy bản ghi chính.'; end if;
  v_total_debt := coalesce(v_primary.debt,0);

  for v_id in
    select duplicate_id from unnest(p_duplicate_ids) as duplicate_rows(duplicate_id)
  loop
    v_expected := nullif(p_expected_updated_at->>v_id::text,'')::timestamptz;
    perform 1 from public.customers where id=v_id and shop_id=p_shop and deleted_at is null
      and (v_expected is null or updated_at=v_expected) for update;
    if not found then raise exception 'Dữ liệu khách hàng đã thay đổi. Vui lòng quét lại trước khi hợp nhất.';
    end if;

    select v_total_debt + coalesce(debt,0) into v_total_debt
    from public.customers where id=v_id and shop_id=p_shop;

    update public.orders set customer_id=p_primary_id where shop_id=p_shop and customer_id=v_id;
    if to_regclass('public.return_notes') is not null then
      execute 'update public.return_notes set customer_id=$1 where shop_id=$2 and customer_id=$3' using p_primary_id,p_shop,v_id;
    end if;
    if to_regclass('public.crm_deals') is not null then
      execute 'update public.crm_deals set customer_id=$1 where shop_id=$2 and customer_id=$3' using p_primary_id,p_shop,v_id;
    end if;
    update public.customer_interactions set customer_id=p_primary_id where shop_id=p_shop and customer_id=v_id;
    update public.customer_debt_ledger set customer_id=p_primary_id where shop_id=p_shop and customer_id=v_id;
    update public.customer_attachments set customer_id=p_primary_id where shop_id=p_shop and customer_id=v_id;
    update public.notes set customer_id=p_primary_id where shop_id=p_shop and customer_id=v_id;
    update public.customers set deleted_at=now(),status='inactive',updated_at=now() where id=v_id and shop_id=p_shop;
    v_merged := v_merged + 1;
  end loop;

  update public.customers c set
    name=coalesce(nullif(p_patch->>'name',''),c.name),
    phone=case when p_patch?'phone' then nullif(p_patch->>'phone','') else c.phone end,
    email=case when p_patch?'email' then nullif(p_patch->>'email','') else c.email end,
    address=case when p_patch?'address' then nullif(p_patch->>'address','') else c.address end,
    debt=v_total_debt,
    updated_at=now()
  where c.id=p_primary_id and c.shop_id=p_shop;

  insert into public.customer_interactions(shop_id,customer_id,type,content,metadata,created_by)
  values(p_shop,p_primary_id,'system','Đã hợp nhất '||v_merged||' hồ sơ khách trùng',jsonb_build_object('mergedIds',p_duplicate_ids),auth.uid());
  return jsonb_build_object('primaryId',p_primary_id,'merged',v_merged);
end $$;

grant execute on function public.crm_import_customers(uuid,jsonb,text,uuid,text) to authenticated;
grant execute on function public.crm_merge_customers(uuid,uuid,uuid[],jsonb,jsonb) to authenticated;
grant execute on function public.crm_list_customers(uuid,text,numeric,uuid,text,date,date,boolean,text,text,int,int) to authenticated;

commit;

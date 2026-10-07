-- v37 — hardening cho Template hóa đơn (chạy sau v36)
-- Hai mẫu được lưu theo shop trong settings:
--   invoice_template_large, invoice_template_receipt
-- Mẫu mặc định không cần lưu bản copy; frontend xóa key khi dùng mặc định.

create or replace function public._settings_validate_invoice_template()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.key in ('invoice_template_large', 'invoice_template_receipt', 'invoice_template') then
    if new.value is null or btrim(new.value) = '' then
      raise exception 'Invoice template cannot be empty' using errcode = '22023';
    end if;
    if octet_length(new.value) > 204800 then
      raise exception 'Invoice template exceeds 200 KB' using errcode = '22001';
    end if;
    if new.value ~* '<[[:space:]]*(script|iframe|object|embed|form|meta|base)([[:space:]>])'
       or new.value ~* 'on[a-z]+[[:space:]]*='
       or new.value ~* 'javascript[[:space:]]*:' then
      raise exception 'Invoice template contains unsafe HTML' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists settings_validate_invoice_template on public.settings;
create trigger settings_validate_invoice_template
before insert or update of key, value on public.settings
for each row execute function public._settings_validate_invoice_template();

-- Không cho client gọi trực tiếp trigger function.
revoke all on function public._settings_validate_invoice_template() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- PioPio v47 — không lưu API token plaintext và loại secret khỏi config client
-- Chạy sau v46. Idempotent.
-- ============================================================================
begin;

create extension if not exists pgcrypto;

alter table public.api_tokens
  add column if not exists token_prefix text;

-- Chuyển token cũ sang SHA-256. Token hiện hữu phải được rotate vì plaintext
-- cũ không thể hiển thị lại sau migration.
update public.api_tokens
   set token_prefix = coalesce(token_prefix, left(token, 14)),
       token = encode(digest(token, 'sha256'), 'hex')
 where token !~ '^[0-9a-f]{64}$';

update public.api_tokens
   set token_prefix = coalesce(token_prefix, 'piopio_unknown')
 where token_prefix is null;

alter table public.api_tokens
  alter column token_prefix set not null;

create unique index if not exists api_tokens_hash_unique_idx
  on public.api_tokens(token);

comment on column public.api_tokens.token is
  'SHA-256 hex của token; không lưu secret plaintext. Backend xác thực bằng cách hash token nhận vào.';
comment on column public.api_tokens.token_prefix is
  'Prefix công khai để người dùng nhận diện token trong UI.';

-- Repo frontend chưa có backend secret manager/worker. Xóa khóa bí mật từng
-- bị lưu plaintext; các giá trị không bí mật (brand_name, oa_id, bank_account)
-- vẫn được giữ nguyên.
update public.integration_settings
   set config = config - 'api_key' - 'access_token' - 'webhook_token',
       enabled = false,
       updated_at = now()
 where config ?| array['api_key', 'access_token', 'webhook_token'];

commit;

/**
 * Link khôi phục mật khẩu của Supabase được gắn vào URL hash, trong khi app
 * dùng hash-router của Angular. Hai hash chồng nhau:
 *   #/reset-password#access_token=...&refresh_token=...&type=recovery
 * Hàm này chỉ lấy phần tham số Supabase (sau dấu # cuối) và chỉ chấp nhận
 * link đúng loại recovery.
 */
export const RECOVERY_HASH_KEY = 'piopio-recovery-hash';

export function recoveryParamsFromHash(hash: string | null | undefined): string | null {
  if (!hash) return null;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = raw.includes('#') ? raw.slice(raw.indexOf('#') + 1) : raw;
  if (!params.includes('type=recovery')) return null;
  if (!params.includes('access_token=') && !params.includes('error_description=')) return null;
  return params;
}

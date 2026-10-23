import { describe, expect, it } from 'vitest';
import { recoveryParamsFromHash } from './recovery-link';

describe('recoveryParamsFromHash', () => {
  it('tách token khi Supabase nối hash vào sau route', () => {
    const hash =
      '#/reset-password#access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer&type=recovery';
    expect(recoveryParamsFromHash(hash)).toBe(
      'access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer&type=recovery'
    );
  });

  it('nhận link chỉ có một hash', () => {
    expect(recoveryParamsFromHash('#access_token=abc&refresh_token=def&type=recovery')).toBe(
      'access_token=abc&refresh_token=def&type=recovery'
    );
  });

  it('nhận link lỗi/hết hạn do Supabase trả về', () => {
    expect(
      recoveryParamsFromHash('#error=access_denied&error_description=Email+link+is+invalid&type=recovery')
    ).toContain('error_description=Email+link+is+invalid');
  });

  it('bỏ qua hash không phải recovery', () => {
    expect(recoveryParamsFromHash('#access_token=abc&type=signup')).toBeNull();
    expect(recoveryParamsFromHash('#/home')).toBeNull();
    expect(recoveryParamsFromHash('')).toBeNull();
    expect(recoveryParamsFromHash(null)).toBeNull();
  });
});

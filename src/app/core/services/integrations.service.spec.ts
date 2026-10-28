import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntegrationsService } from './integrations.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';

describe('IntegrationsService secret handling', () => {
  let service: IntegrationsService;
  let from: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    from = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        IntegrationsService,
        { provide: SupabaseService, useValue: { from } },
        { provide: AuthService, useValue: { shop: () => ({ id: 'shop-1' }) } },
        { provide: LogService, useValue: { log: vi.fn() } },
      ],
    });
    service = TestBed.inject(IntegrationsService);
  });

  it('fails closed instead of storing provider secrets in plaintext', async () => {
    await expect(
      service.save('sms', true, { brand_name: 'PIOPIO', api_key: 'secret-value' })
    ).rejects.toThrow(/không lưu khóa bí mật/i);
    expect(from).not.toHaveBeenCalled();
  });

  it('does not enable a provider without a server-side secret backend', async () => {
    await expect(
      service.save('sepay', true, { bank_account: '123456' })
    ).rejects.toThrow(/chưa thể bật tích hợp/i);
    expect(from).not.toHaveBeenCalled();
  });
});

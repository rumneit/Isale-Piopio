import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiTokensService } from './api-tokens.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';

describe('ApiTokensService secret handling', () => {
  let service: ApiTokensService;
  let inserted: Record<string, unknown> | undefined;

  beforeEach(() => {
    inserted = undefined;
    const from = vi.fn().mockReturnValue({
      insert: vi.fn().mockImplementation((value) => {
        inserted = value;
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'token-1', shop_id: 'shop-1', name: value.name,
                token_prefix: value.token_prefix, scopes: value.scopes,
                last_used_at: null, revoked: false,
              },
              error: null,
            }),
          }),
        };
      }),
    });
    TestBed.configureTestingModule({
      providers: [
        ApiTokensService,
        { provide: SupabaseService, useValue: { isConfigured: true, from } },
        { provide: AuthService, useValue: { shop: () => ({ id: 'shop-1' }) } },
        { provide: LogService, useValue: { log: vi.fn() } },
      ],
    });
    service = TestBed.inject(ApiTokensService);
  });

  it('stores only a SHA-256 hash and returns plaintext once', async () => {
    const created = await service.create('Website', 'read');

    expect(created.plain_token).toMatch(/^piopio_[0-9a-f]{32}$/);
    expect(inserted?.['token']).toMatch(/^[0-9a-f]{64}$/);
    expect(inserted?.['token']).not.toBe(created.plain_token);
    expect(inserted?.['token_prefix']).toBe(created.plain_token?.slice(0, 14));
  });
});

import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReturnsService } from './returns.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

describe('ReturnsService money and stock atomicity', () => {
  let service: ReturnsService;
  let rpc: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rpc = vi.fn();
    TestBed.configureTestingModule({ providers: [
      ReturnsService,
      { provide: SupabaseService, useValue: { isConfigured: true, client: { rpc }, from: vi.fn() } },
      { provide: AuthService, useValue: { shop: () => ({ id: 'shop-1' }) } },
    ] });
    service = TestBed.inject(ReturnsService);
  });

  it('rejects an empty return before contacting the database', async () => {
    await expect(service.create({ order_id: 'o', order_code: 'DH-1', customer_id: null, refunded: true, note: null }, []))
      .rejects.toThrow(/ít nhất một sản phẩm/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('creates return, inventory and debt effects in one idempotent RPC', async () => {
    rpc.mockResolvedValue({ data: { id: 'r1', code: 'TH-1', cash_refund: 0, debt_credit: 100 }, error: null });
    const result = await service.create(
      { order_id: 'o1', order_code: 'DH-1', customer_id: 'c1', refunded: true, note: 'trả', idempotencyKey: 'nonce' },
      [{ product_id: 'p1', name: 'Hộp', price: 100, qty: 1 }]
    );
    expect(result.debt_credit).toBe(100);
    expect(rpc).toHaveBeenCalledWith('inv_create_return_note', expect.objectContaining({
      p_shop: 'shop-1', p_nonce: 'nonce', p_items: [expect.objectContaining({ price: 100, qty: 1 })],
    }));
  });

  it('fails closed when the atomic return RPC is absent', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'inv_create_return_note missing' } });
    await expect(service.create(
      { order_id: 'o', order_code: 'DH', customer_id: null, refunded: false, note: null, idempotencyKey: 'n' },
      [{ product_id: null, name: 'x', price: 1, qty: 1 }]
    )).rejects.toThrow(/cập nhật database/i);
  });
});

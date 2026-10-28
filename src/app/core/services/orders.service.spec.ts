import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrdersService } from './orders.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';

describe('OrdersService lifecycle safety', () => {
  let service: OrdersService;
  let rpc: ReturnType<typeof vi.fn>;
  let from: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rpc = vi.fn();
    from = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        OrdersService,
        {
          provide: SupabaseService,
          useValue: { isConfigured: true, client: { rpc }, from },
        },
        {
          provide: AuthService,
          useValue: { shop: () => ({ id: 'shop-1' }) },
        },
        {
          provide: LogService,
          useValue: { log: vi.fn() },
        },
      ],
    });
    service = TestBed.inject(OrdersService);
  });

  it('fails closed when the safe delete RPC is missing', async () => {
    rpc.mockResolvedValue({
      error: { code: 'PGRST202', message: 'Could not find the function inv_delete_order' },
    });

    await expect(service.remove('order-1')).rejects.toThrow(/migration v43-v46/i);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('inv_delete_order', {
      p_shop: 'shop-1',
      p_order_id: 'order-1',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('does not fall back to a direct order update when lifecycle RPC is missing', async () => {
    rpc.mockResolvedValue({
      error: { code: 'PGRST202', message: 'Could not find the function inv_set_order_status' },
    });

    await expect(service.setStatus('order-1', 'cancelled')).rejects.toThrow(/migration v43-v46/i);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });
});

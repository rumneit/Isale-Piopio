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
  let log: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rpc = vi.fn();
    from = vi.fn();
    log = vi.fn();
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
          useValue: { log },
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

  it('calculates money consistently and sends unit metadata through v48', async () => {
    rpc.mockResolvedValue({ data: { id: 'o1', code: 'DH-1', total: 205 }, error: null });
    const result = await service.create(
      { code: 'DH-1', discount_percent: 10, tax_percent: 5, ship_fee: 10, ship_fee_by_customer: true },
      [{ product_id: 'p1', name: 'Hộp', price: 100, qty: 2, unit: 'Thùng', unit_qty: 1, unit_conversion: 2, unit_price: 200 }],
      { idempotencyKey: 'nonce-1', recordIncome: true }
    );
    expect(result.id).toBe('o1');
    expect(rpc).toHaveBeenCalledWith('inv_create_order_v48', {
      p_shop: 'shop-1',
      p_order: expect.objectContaining({ code: 'DH-1', total: 200 }),
      p_items: [expect.objectContaining({ unit: 'Thùng', unit_price: 200 })],
      p_nonce: 'nonce-1',
      p_record_income: true,
    });
    expect(log).toHaveBeenCalledWith('create', 'order', 'DH-1');
  });

  it('fails closed when atomic unit metadata migration is absent', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'inv_create_order_v48 missing' } });
    await expect(service.create({}, [{ product_id: null, name: 'x', price: 1, qty: 1 }], { idempotencyKey: 'n' }))
      .rejects.toThrow(/migration v48/i);
  });

  it('updates the complete order atomically and then stores its account', async () => {
    rpc
      .mockResolvedValueOnce({ data: { id: 'o1', code: 'DH-1' }, error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const input = {
      code: 'DH-1', customer_id: null, customer_name: 'Khách', status: 'completed',
      account_id: 'a1', discount_percent: 0, tax_percent: 0, ship_fee: 0,
      ship_fee_by_customer: true, note: null,
    };
    await expect(service.updateFullOrder('o1', input, [{ product_id: null, name: 'x', price: 1, qty: 1 }]))
      .resolves.toMatchObject({ id: 'o1' });
    expect(rpc).toHaveBeenNthCalledWith(1, 'inv_update_order_full_v48', expect.objectContaining({ p_order_id: 'o1' }));
    expect(rpc).toHaveBeenNthCalledWith(2, 'inv_set_order_account', { p_shop: 'shop-1', p_order_id: 'o1', p_account: 'a1' });
  });

  it('uses lifecycle RPCs for paid/payment changes and bulk operations', async () => {
    rpc.mockResolvedValue({ error: null });
    await service.setPaid('o1', true);
    await service.setPaymentMethod('o1', 'CASH');
    await service.bulkUpdateStatus(['o1', 'o2'], 'cancelled');
    await service.bulkRemove(['o1', 'o2']);
    expect(rpc).toHaveBeenCalledWith('inv_set_order_paid', { p_shop: 'shop-1', p_order_id: 'o1', p_paid: true });
    expect(rpc).toHaveBeenCalledWith('inv_set_order_payment', { p_shop: 'shop-1', p_order_id: 'o1', p_method: 'CASH' });
    expect(rpc).toHaveBeenCalledWith('inv_delete_order', { p_shop: 'shop-1', p_order_id: 'o2' });
  });

  it('keeps stable labels for historical status and payment codes', () => {
    expect(OrdersService.statusLabel('debt')).toBe('Công nợ');
    expect(OrdersService.statusLabel('legacy')).toBe('legacy');
    expect(OrdersService.statusColor('completed')).toBe('success');
    expect(OrdersService.statusColor('legacy')).toBe('medium');
    expect(OrdersService.paymentLabel('BANK-TRANSFER')).toBe('Chuyển khoản');
    expect(OrdersService.paymentLabel(null)).toBe('—');
  });
});

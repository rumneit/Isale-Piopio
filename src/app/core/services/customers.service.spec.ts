import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomersService } from './customers.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';

function query(result: any) {
  const q: any = {};
  for (const method of ['select', 'eq', 'is', 'or', 'gt', 'gte', 'lte', 'order', 'range', 'insert', 'update', 'delete']) q[method] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => result);
  q.single = vi.fn(async () => result);
  q.then = (resolve: (value: any) => unknown) => Promise.resolve(result).then(resolve);
  return q;
}

describe('CustomersService debt and identity integrity', () => {
  let service: CustomersService;
  let from: ReturnType<typeof vi.fn>;
  let rpc: ReturnType<typeof vi.fn>;
  let log: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    from = vi.fn();
    rpc = vi.fn();
    log = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        CustomersService,
        { provide: SupabaseService, useValue: { isConfigured: true, from, client: { rpc } } },
        { provide: AuthService, useValue: { shop: () => ({ id: 'shop-1' }) } },
        { provide: LogService, useValue: { log } },
      ],
    });
    service = TestBed.inject(CustomersService);
  });

  it('validates customer identity and debt before any write', async () => {
    await expect(service.create({ name: '' })).rejects.toThrow(/Họ tên là bắt buộc/i);
    await expect(service.create({ name: 'A' })).rejects.toThrow(/2 đến 160/i);
    await expect(service.create({ name: 'Khách', phone: '123' })).rejects.toThrow(/điện thoại/i);
    await expect(service.create({ name: 'Khách', email: 'invalid' })).rejects.toThrow(/Email/i);
    await expect(service.create({ name: 'Khách', debt: -1 })).rejects.toThrow(/Công nợ/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('creates customer through RPC and persists buyer/contact person', async () => {
    rpc.mockResolvedValue({ data: { id: 'c1', name: 'Quán A' }, error: null });
    const q = query({ error: null });
    from.mockReturnValue(q);
    await expect(service.create({
      name: 'Quán A', contact_person: 'Người mua', phone: '0912345678', address: 'Q2', debt: 0,
    })).resolves.toMatchObject({ id: 'c1', contact_person: 'Người mua' });
    expect(rpc).toHaveBeenCalledWith('crm_create_customer', expect.objectContaining({ p_shop: 'shop-1' }));
    expect(q.update).toHaveBeenCalledWith({ contact_person: 'Người mua' });
    expect(log).toHaveBeenCalledWith('create', 'customer', 'Quán A');
  });

  it('normalizes phone and falls back only for an old schema', async () => {
    const modern = query({ data: { id: 'c1', phone: '0912345678' }, error: null });
    from.mockReturnValueOnce(modern);
    await expect(service.findByPhone('0912 345 678')).resolves.toMatchObject({ id: 'c1' });
    expect(modern.eq).toHaveBeenCalledWith('phone_normalized', '0912345678');

    const missing = query({ data: null, error: { code: '42703' } });
    const legacy = query({ data: { id: 'c2' }, error: null });
    from.mockReturnValueOnce(missing).mockReturnValueOnce(legacy);
    await expect(service.findByPhone('0912345678')).resolves.toMatchObject({ id: 'c2' });
    expect(legacy.eq).toHaveBeenCalledWith('phone', '0912345678');
  });

  it('uses the server-side paginated customer query with bounded page size', async () => {
    rpc.mockResolvedValue({ data: { items: [{ id: 'c1' }], total: 1 }, error: null });
    await expect(service.listAdvanced({ q: ' Quán ', page: -3, pageSize: 999, sortBy: 'debt' }))
      .resolves.toEqual({ items: [{ id: 'c1' }], total: 1, page: 1, pageSize: 100 });
    expect(rpc).toHaveBeenCalledWith('crm_list_customers', expect.objectContaining({
      p_shop: 'shop-1', p_q: 'Quán', p_page: 1, p_page_size: 100, p_sort_by: 'debt',
    }));
  });

  it('adjusts debt only with positive finite amounts and returns server balance', async () => {
    await expect(service.adjustDebt('c1', 0, 'payment')).rejects.toThrow(/lớn hơn 0/i);
    await expect(service.adjustDebt('c1', Number.NaN, 'adjustment')).rejects.toThrow(/lớn hơn 0/i);
    rpc.mockResolvedValue({ data: { balance: '25000' }, error: null });
    await expect(service.adjustDebt('c1', 5000, 'payment', 'Thu nợ')).resolves.toBe(25000);
    expect(rpc).toHaveBeenCalledWith('crm_adjust_customer_debt', expect.objectContaining({ p_amount: 5000 }));
  });

  it('soft deletes and merges through tenant-scoped RPCs', async () => {
    rpc.mockResolvedValue({ error: null });
    await service.remove('c1');
    await service.merge('c1', [{ id: 'c2', updated_at: '2026-01-01' } as any], { phone: '0912345678' });
    expect(rpc).toHaveBeenCalledWith('crm_soft_delete_customer', { p_shop: 'shop-1', p_customer_id: 'c1' });
    expect(rpc).toHaveBeenCalledWith('crm_merge_customers', expect.objectContaining({
      p_shop: 'shop-1', p_primary_id: 'c1', p_duplicate_ids: ['c2'],
    }));
  });
});

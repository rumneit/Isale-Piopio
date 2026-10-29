import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionsService } from './transactions.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';

function query(result: any) {
  const q: any = {};
  for (const method of ['select', 'eq', 'order', 'or', 'insert', 'update', 'delete', 'limit']) q[method] = vi.fn(() => q);
  q.single = vi.fn(async () => result);
  q.then = (resolve: (value: any) => unknown) => Promise.resolve(result).then(resolve);
  return q;
}

describe('TransactionsService money integrity', () => {
  let service: TransactionsService;
  let from: ReturnType<typeof vi.fn>;
  let rpc: ReturnType<typeof vi.fn>;
  let log: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    from = vi.fn();
    rpc = vi.fn();
    log = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        TransactionsService,
        { provide: SupabaseService, useValue: { isConfigured: true, from, client: { rpc } } },
        { provide: AuthService, useValue: { shop: () => ({ id: 'shop-1' }) } },
        { provide: LogService, useValue: { log } },
      ],
    });
    service = TestBed.inject(TransactionsService);
  });

  it('maps payment and source labels without changing stored codes', () => {
    expect(service.paymentTypeLabel()).toBe('Tiền mặt');
    expect(service.paymentTypeLabel('BANK')).toBe('Chuyển khoản');
    expect(service.paymentTypeLabel('CUSTOM')).toBe('CUSTOM');
    expect(service.sourceLabel('order')).toBe('Đơn hàng');
    expect(service.sourceLabel('debt')).toBe('Công nợ');
    expect(service.sourceLabel('transfer')).toBe('Chuyển nội bộ');
    expect(service.sourceLabel('recurring')).toBe('Định kỳ');
    expect(service.sourceLabel('manual')).toBe('');
  });

  it('lists filtered transactions with escaped search text', async () => {
    const q = query({ data: [{ id: 't1' }], error: null });
    from.mockReturnValue(q);
    await expect(service.list('income', 'a,b')).resolves.toEqual([{ id: 't1' }]);
    expect(q.eq).toHaveBeenCalledWith('type', 'income');
    expect(q.or).toHaveBeenCalled();
  });

  it('creates a transaction and records an audit label', async () => {
    const q = query({ data: { id: 't1', type: 'income', amount: 15000 }, error: null });
    from.mockReturnValue(q);
    await expect(service.create({ type: 'income', amount: 15000 } as any)).resolves.toMatchObject({ id: 't1' });
    expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({ shop_id: 'shop-1', amount: 15000 }));
    expect(log).toHaveBeenCalledWith('create', 'transaction', expect.stringContaining('15.000'));
  });

  it('retries a legacy payload only for a missing v24 column', async () => {
    const first = query({ data: null, error: { code: 'PGRST204', message: 'missing column' } });
    const second = query({ data: { id: 't2', type: 'expense', amount: 10 }, error: null });
    from.mockReturnValueOnce(first).mockReturnValueOnce(second);
    await service.create({ type: 'expense', amount: 10, source: 'order', order_id: 'o' } as any);
    expect(second.insert).toHaveBeenCalledWith(expect.not.objectContaining({ source: expect.anything(), order_id: expect.anything() }));
  });

  it('translates server guards instead of hiding money errors', async () => {
    from.mockReturnValue(query({ error: { message: 'transactions_guard: không thể sửa/xóa thủ công' } }));
    await expect(service.remove('t1')).rejects.toThrow(/thuộc đơn hàng\/công nợ/i);
    from.mockReturnValue(query({ error: { message: 'transactions_amount_positive' } }));
    await expect(service.update('t1', { amount: -1 })).rejects.toThrow(/Số tiền không hợp lệ/i);
    expect(TransactionsService.isMissingColumn({ code: 'PGRST204' })).toBe(true);
    expect(TransactionsService.isMissingColumn({ message: "Could not find the 'source' column" })).toBe(true);
  });

  it('uses an atomic RPC for internal transfers and reads balances', async () => {
    rpc
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ data: [{ account_id: 'a', total: '120.5' }], error: null });
    await expect(service.transferMoney('a', 'b', 100, 2, 'test')).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('transfer_money', expect.objectContaining({ p_shop: 'shop-1', p_amount: 100, p_fee: 2 }));
    const balances = await service.accountBalances();
    expect(balances.get('a')).toBe(120.5);
  });

  it('fails closed when the transfer RPC is missing', async () => {
    rpc.mockResolvedValue({ error: { code: 'PGRST202', message: 'could not find the function' } });
    await expect(service.transferMoney('a', 'b', 10, 0)).rejects.toThrow(/migration v24/i);
  });
});

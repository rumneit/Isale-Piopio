import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductsService } from './products.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';

function query(result: any) {
  const q: any = {};
  for (const method of ['select', 'eq', 'order', 'or', 'range', 'gt', 'gte', 'limit', 'insert', 'update', 'delete']) q[method] = vi.fn(() => q);
  q.single = vi.fn(async () => result);
  q.maybeSingle = vi.fn(async () => result);
  q.then = (resolve: (value: any) => unknown) => Promise.resolve(result).then(resolve);
  return q;
}

describe('ProductsService inventory boundaries', () => {
  let service: ProductsService;
  let from: ReturnType<typeof vi.fn>;
  let log: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    from = vi.fn(); log = vi.fn();
    TestBed.configureTestingModule({ providers: [
      ProductsService,
      { provide: SupabaseService, useValue: { isConfigured: true, from, client: { storage: { from: vi.fn() } } } },
      { provide: AuthService, useValue: { shop: () => ({ id: 'shop-1' }) } },
      { provide: LogService, useValue: { log } },
    ] });
    service = TestBed.inject(ProductsService);
  });

  it('paginates, filters and sorts on the server', async () => {
    const q = query({ data: [{ id: 'p1' }], count: 1, error: null }); from.mockReturnValue(q);
    await expect(service.listPaged('hộp,25', 2, 30, 'price', 'instock', 'cat-1'))
      .resolves.toEqual({ items: [{ id: 'p1' }], total: 1 });
    expect(q.range).toHaveBeenCalledWith(30, 59);
    expect(q.gt).toHaveBeenCalledWith('stock', 0);
    expect(q.eq).toHaveBeenCalledWith('category_id', 'cat-1');
    expect(q.order).toHaveBeenCalledWith('price', { ascending: false });
    expect(q.or).toHaveBeenCalled();
  });

  it('detects optional columns without treating all failures alike', async () => {
    from.mockReturnValueOnce(query({ error: null }));
    await expect(service.detectOptionalColumns()).resolves.toEqual({ expiry: true, barcode: true, image: true });
    from.mockReturnValueOnce(query({ error: { message: 'column expiry_date does not exist' } }));
    await expect(service.detectOptionalColumns()).resolves.toEqual({ expiry: false, barcode: true, image: true });
  });

  it('creates one or many tenant-scoped products and audits them', async () => {
    const one = query({ data: { id: 'p1', name: 'Hộp' }, error: null });
    const many = query({ data: [{ id: 'p2', name: 'Ly' }, { id: 'p3', name: 'Nắp' }], error: null });
    from.mockReturnValueOnce(one).mockReturnValueOnce(many);
    await expect(service.create({ name: 'Hộp', price: 100 })).resolves.toMatchObject({ id: 'p1' });
    await expect(service.createMany([{ name: 'Ly' }, { name: 'Nắp' }])).resolves.toHaveLength(2);
    expect(one.insert).toHaveBeenCalledWith(expect.objectContaining({ shop_id: 'shop-1' }));
    expect(log).toHaveBeenCalledTimes(3);
    await expect(service.createMany([])).resolves.toEqual([]);
  });

  it('keeps mutations scoped to both id and shop', async () => {
    const update = query({ error: null }); const remove = query({ error: null });
    from.mockReturnValueOnce(update).mockReturnValueOnce(remove);
    await service.update('p1', { name: 'Mới' }); await service.remove('p1');
    expect(update.eq).toHaveBeenCalledWith('shop_id', 'shop-1');
    expect(remove.eq).toHaveBeenCalledWith('shop_id', 'shop-1');
  });
});

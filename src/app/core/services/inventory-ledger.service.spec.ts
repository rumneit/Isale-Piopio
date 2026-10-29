import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryLedgerService } from './inventory-ledger.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

describe('InventoryLedgerService atomic RPC boundaries', () => {
  let service: InventoryLedgerService;
  let rpc: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rpc = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        InventoryLedgerService,
        { provide: SupabaseService, useValue: { isConfigured: true, client: { rpc } } },
        { provide: AuthService, useValue: { shop: () => ({ id: 'shop-1' }) } },
      ],
    });
    service = TestBed.inject(InventoryLedgerService);
  });

  it('filters non-product rows and applies a note atomically', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(service.applyNote('received_note', 'note-1', [
      { product_id: null, name: 'free text', qty: 5 },
      { product_id: 'product-1', name: 'Hộp', qty: 2, cost: 1000 },
    ])).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('inv_apply_note', {
      p_shop: 'shop-1', p_ref_type: 'received_note', p_ref_id: 'note-1',
      p_items: [{ product_id: 'product-1', name: 'Hộp', qty: 2, cost: 1000 }],
    });
    rpc.mockClear();
    await expect(service.applyNote('received_note', 'note-2', [{ product_id: null, name: 'x', qty: 1 }])).resolves.toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fails closed when inventory mutation RPCs are missing', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'schema cache' } });
    await expect(service.applyNote('return_note', 'n', [{ product_id: 'p', name: 'x', qty: 1 }]))
      .rejects.toThrow(/dừng an toàn/i);
    await expect(service.reverseNote('return_note', 'n')).rejects.toThrow(/đảo phiếu an toàn/i);
    await expect(service.completeStockCount('c', [])).rejects.toThrow(/chốt kiểm kê an toàn/i);
    await expect(service.createTransfer({ code: 'C', destination: null, note: null, items: [] }))
      .rejects.toThrow(/phiếu chưa được tạo/i);
  });

  it('maps successful reverse, stock count and audit history results', async () => {
    rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: [{ already: true, items: [{ product_id: 'p' }], total_diff: -2 }], error: null })
      .mockResolvedValueOnce({ data: [{ action: 'UPDATE' }], error: null });
    await expect(service.reverseNote('transfer_out', 't')).resolves.toBe(true);
    await expect(service.completeStockCount('c', [{ product_id: 'p', name: 'P', counted_qty: 3 }]))
      .resolves.toEqual({ fallback: false, already: true, items: [{ product_id: 'p' }], total_diff: -2 });
    await expect(service.history('products', 'p', 25)).resolves.toEqual([{ action: 'UPDATE' }]);
  });

  it('creates and receives transfers through server-side transactions', async () => {
    rpc
      .mockResolvedValueOnce({ data: 'transfer-1', error: null })
      .mockResolvedValueOnce({ data: { already: false, items: [{ product_id: 'p' }] }, error: null });
    await expect(service.createTransfer({
      code: 'CK-1', destination: 'Kho B', note: null,
      items: [{ product_id: 'p', name: 'P', qty: 2 }],
    })).resolves.toBe('transfer-1');
    await expect(service.receiveTransfer({
      transferId: 'transfer-1',
      items: [{ product_id: 'p', name: 'P', qty_sent: 2, qty_received: 1 }],
      resolution: 'write_off', reason: 'damaged', reasonNote: 'vỡ',
    })).resolves.toEqual({ fallback: false, already: false, items: [{ product_id: 'p' }] });
  });

  it('maps maker-checker approval, rejection and outstanding receipts', async () => {
    rpc
      .mockResolvedValueOnce({ data: [{ status: 'partial', total: '100', paid: '40', remaining: '60' }], error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: [{
        root_id: 'r', root_code: 'PN-1', supplier_name: null, supplier_id: null,
        created_at: '2026-01-01', outstanding_items: [{ product_id: 'p', outstanding: 2 }],
      }], error: null });
    await expect(service.approveNote('n', 'nonce')).resolves.toEqual({ status: 'partial', total: 100, paid: 40, remaining: 60 });
    await expect(service.rejectNote('n', 'sai hàng')).resolves.toBe(true);
    await expect(service.openReceiveNotes()).resolves.toEqual([{
      root_id: 'r', root_code: 'PN-1', supplier_name: null, supplier_id: null,
      created_at: '2026-01-01', outstanding_items: [{ product_id: 'p', outstanding: 2 }],
    }]);
  });

  it('returns safe read-only fallbacks for missing optional v29 RPCs', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'missing' } });
    await expect(service.history('products', 'p')).resolves.toEqual([]);
    await expect(service.approveNote('n', null)).resolves.toBeNull();
    await expect(service.rejectNote('n', null)).resolves.toBeNull();
    await expect(service.openReceiveNotes()).resolves.toBeNull();
  });
});

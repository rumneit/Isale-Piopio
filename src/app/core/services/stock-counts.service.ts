import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';
import { ProductsService } from './products.service';
import { InventoryLedgerService } from './inventory-ledger.service';
import { StockCount, StockCountItem } from '../models/models';

/**
 * Kiểm kê kho (cycle count) theo chuẩn WMS:
 * - Tạo phiếu nháp (draft) ghi lại tồn hệ thống + số lượng đếm thực tế.
 * - Khi hoàn tất (completed): server RE-BASE chênh lệch theo tồn HIỆN TẠI
 *   (khoá dòng SP trong 1 transaction qua inventory_ledger v27) → việc bán
 *   hàng trong lúc kiểm kê không làm sai kết quả. Fallback khi chưa chạy
 *   migration v27: đè tồn = số đếm client-side như trước.
 */
@Injectable({ providedIn: 'root' })
export class StockCountsService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private logService = inject(LogService);
  private productsService = inject(ProductsService);
  private ledger = inject(InventoryLedgerService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  newCode(): string {
    const d = new Date();
    const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `KK-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  static totalDiff(items: StockCountItem[]): number {
    return items.reduce((s, i) => s + (Number(i.diff) || 0), 0);
  }

  async list(search = ''): Promise<StockCount[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('stock_counts')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false });

    if (search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.ilike('code', term);
    }

    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as any[]).map((row) => ({
      ...row,
      items: Array.isArray(row.items) ? row.items : [],
    })) as StockCount[];
  }

  async get(id: string): Promise<StockCount | null> {
    if (!this.sb.isConfigured || !this.shopId) return null;
    const { data, error } = await this.sb
      .from('stock_counts')
      .select('*')
      .eq('id', id)
      .eq('shop_id', this.shopId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { ...(data as any), items: Array.isArray((data as any).items) ? (data as any).items : [] } as StockCount;
  }

  async createDraft(items: StockCountItem[], note: string | null): Promise<StockCount> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');
    if (!items.length) throw new Error('Phiếu kiểm kê cần ít nhất một sản phẩm.');

    const { data, error } = await this.sb
      .from('stock_counts')
      .insert({
        shop_id: shopId,
        code: this.newCode(),
        status: 'draft',
        items,
        total_diff: StockCountsService.totalDiff(items),
        note,
        created_by: this.auth.displayName(),
      })
      .select()
      .single();
    if (error) throw error;
    this.logService.log('create', 'stock_count', (data as StockCount).code);
    return data as StockCount;
  }

  async updateDraft(id: string, items: StockCountItem[], note: string | null): Promise<void> {
    const { error } = await this.sb
      .from('stock_counts')
      .update({ items, total_diff: StockCountsService.totalDiff(items), note })
      .eq('id', id)
      .eq('shop_id', this.shopId!)
      .eq('status', 'draft');
    if (error) throw error;
  }

  /**
   * Hoàn tất kiểm kê: server re-base chênh lệch theo tồn hiện tại rồi ghi
   * sổ cái (v27); fallback khi chưa chạy migration: đè tồn = số đếm (cũ).
   */
  async complete(id: string): Promise<void> {
    const count = await this.get(id);
    if (!count) throw new Error('Không tìm thấy phiếu kiểm kê.');
    if (count.status !== 'draft') throw new Error('Phiếu này đã được chốt.');

    // 1) Ghi sổ cái: diff = số đếm − tồn hiện tại (server khoá dòng SP)
    const res = await this.ledger.completeStockCount(
      id,
      count.items.map((i) => ({ product_id: i.product_id, name: i.name, counted_qty: Number(i.counted_qty) || 0 }))
    );

    let itemsForSave: StockCountItem[] | null = null;
    let totalDiff = StockCountsService.totalDiff(count.items);

    if (!res.fallback) {
      if (res.items && res.items.length) {
        // Ghi lại items với system_qty/diff đã re-base theo tồn tại thời điểm chốt
        itemsForSave = count.items.map((i) => {
          const rb = res.items!.find((x) => x.product_id === i.product_id);
          if (!rb) return i;
          return { ...i, system_qty: rb.system_qty, counted_qty: rb.counted_qty, diff: rb.diff };
        });
        totalDiff = res.total_diff ?? StockCountsService.totalDiff(itemsForSave);
      }
    } else {
      // Fallback cũ: đè tồn = số đếm client-side
      for (const item of count.items) {
        if (!item.product_id) continue;
        try {
          await this.productsService.update(item.product_id, { stock: Number(item.counted_qty) || 0 });
        } catch (e) {
          console.error('stock apply failed for', item.name, e);
        }
      }
    }

    // 2) Chốt phiếu
    const { error } = await this.sb
      .from('stock_counts')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        ...(itemsForSave ? { items: itemsForSave, total_diff: totalDiff } : {}),
      })
      .eq('id', id)
      .eq('shop_id', this.shopId!)
      .eq('status', 'draft');
    if (error) throw error;

    this.logService.log('update', 'stock_count', `${count.code} (chênh lệch ${totalDiff})`);
  }

  async cancel(id: string): Promise<void> {
    const { error } = await this.sb
      .from('stock_counts')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('shop_id', this.shopId!)
      .eq('status', 'draft');
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb
      .from('stock_counts')
      .delete()
      .eq('id', id)
      .eq('shop_id', this.shopId!)
      .eq('status', 'draft');
    if (error) throw error;
  }
}

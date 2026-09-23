import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';
import { ProductsService } from './products.service';
import { StockCount, StockCountItem } from '../models/models';

/**
 * Kiểm kê kho (cycle count) theo chuẩn WMS:
 * - Tạo phiếu nháp (draft) ghi lại tồn hệ thống + số lượng đếm thực tế.
 * - Chênh lệch (diff) = thực tế - hệ thống, tính tại thời điểm đếm.
 * - Khi hoàn tất (completed) mới ghi tồn thật vào sản phẩm + ghi log.
 * Nhờ vậy việc đếm không làm sai tồn kho giữa chừng.
 */
@Injectable({ providedIn: 'root' })
export class StockCountsService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private logService = inject(LogService);
  private productsService = inject(ProductsService);

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

  /** Hoàn tất kiểm kê: ghi tồn thực tế vào sản phẩm rồi chốt phiếu. */
  async complete(id: string): Promise<void> {
    const count = await this.get(id);
    if (!count) throw new Error('Không tìm thấy phiếu kiểm kê.');
    if (count.status !== 'draft') throw new Error('Phiếu này đã được chốt.');

    for (const item of count.items) {
      if (!item.product_id) continue;
      try {
        await this.productsService.update(item.product_id, { stock: Number(item.counted_qty) || 0 });
      } catch (e) {
        console.error('stock apply failed for', item.name, e);
      }
    }

    const { error } = await this.sb
      .from('stock_counts')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;

    this.logService.log('update', 'stock_count', `${count.code} (chênh lệch ${count.total_diff})`);
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

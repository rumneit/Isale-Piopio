import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { TransactionsService } from './transactions.service';
import { ProductsService } from './products.service';
import { PointsService } from './points.service';

export interface ReturnNoteItem {
  product_id: string | null;
  name: string;
  price: number;
  qty: number;
}

export interface ReturnNote {
  id: string;
  shop_id: string;
  order_id: string | null;
  order_code: string | null;
  code: string;
  customer_id: string | null;
  items: ReturnNoteItem[];
  total: number;
  refunded: boolean;
  note: string | null;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ReturnsService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private transactionsService = inject(TransactionsService);
  private productsService = inject(ProductsService);
  private pointsService = inject(PointsService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  newCode(): string {
    const d = new Date();
    const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `TH-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  async list(search = ''): Promise<ReturnNote[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('return_notes')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false });

    if (search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`code.ilike.${term},order_code.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as any[]).map((row) => ({
      ...row,
      items: Array.isArray(row.items) ? row.items : [],
    })) as ReturnNote[];
  }

  /**
   * Tạo phiếu trả hàng: hoàn tồn kho + (tùy chọn) hoàn tiền khách + trừ điểm tích lũy.
   */
  async create(
    input: {
      order_id: string;
      order_code: string;
      customer_id: string | null;
      refunded: boolean;
      note: string | null;
    },
    items: ReturnNoteItem[]
  ): Promise<ReturnNote> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    if (!items.length) throw new Error('Phiếu trả cần ít nhất một sản phẩm.');

    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    const { data, error } = await this.sb
      .from('return_notes')
      .insert({
        shop_id: shopId,
        order_id: input.order_id,
        order_code: input.order_code,
        code: this.newCode(),
        customer_id: input.customer_id,
        items,
        total,
        refunded: input.refunded,
        note: input.note,
      })
      .select()
      .single();
    if (error) throw error;

    // Hoàn tồn kho
    for (const item of items) {
      if (!item.product_id) continue;
      try {
        const product = await this.productsService.get(item.product_id);
        if (product) {
          await this.productsService.update(item.product_id, {
            stock: Number(product.stock ?? 0) + item.qty,
          });
        }
      } catch (e) {
        console.error('stock revert failed for', item.name, e);
      }
    }

    // Hoàn tiền cho khách (ghi giao dịch chi)
    if (input.refunded && total > 0) {
      await this.transactionsService.create({
        type: 'expense',
        category: 'Trả hàng',
        amount: total,
        note: `Hoàn tiền trả hàng ${input.order_code} → ${data.code}`,
        occurred_at: new Date().toISOString(),
      });
    }

    // Trừ điểm tích lũy tương ứng phần trả
    if (input.customer_id && total > 0) {
      try {
        await this.pointsService.revokeForReturn(input.customer_id, total, input.order_code);
      } catch (e) {
        console.error('revoke points failed', e);
      }
    }

    return data as ReturnNote;
  }
}

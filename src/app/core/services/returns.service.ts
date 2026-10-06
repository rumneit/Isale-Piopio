import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { safeIlikeTerm } from '../utils/postgrest-search';

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
      const term = `%${safeIlikeTerm(search)}%`;
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

    const { data, error } = await this.sb.client.rpc('inv_create_return_note', {
      p_shop: shopId,
      p_note: {
        order_id: input.order_id,
        order_code: input.order_code,
        code: this.newCode(),
        customer_id: input.customer_id,
        refunded: input.refunded,
        note: input.note,
      },
      p_items: items,
      p_nonce: crypto.randomUUID(),
    });
    if (error) {
      if (error.code === 'PGRST202' || /inv_create_return_note|schema cache/i.test(error.message)) {
        throw new Error('Cơ sở dữ liệu chưa có migration v34. Hãy cập nhật database trước khi trả hàng.');
      }
      throw error;
    }

    return data as ReturnNote;
  }
}

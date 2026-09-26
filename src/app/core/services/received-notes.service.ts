import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { TransactionsService } from './transactions.service';
import { ProductsService } from './products.service';

export interface ReceivedNoteItem {
  product_id: string | null;
  name: string;
  qty: number;
  cost: number;
}

export interface ReceivedNote {
  id: string;
  shop_id: string;
  code: string;
  supplier_name: string | null;
  total: number;
  items: ReceivedNoteItem[];
  paid: boolean;
  note: string | null;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ReceivedNotesService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private transactionsService = inject(TransactionsService);
  private productsService = inject(ProductsService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  newCode(): string {
    const d = new Date();
    const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `PN-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  async list(search = ''): Promise<ReceivedNote[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('received_notes')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false });

    if (search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`code.ilike.${term},supplier_name.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as any[]).map((row) => ({
      ...row,
      items: Array.isArray(row.items) ? row.items : [],
    })) as ReceivedNote[];
  }

  async create(
    input: { supplier_name: string | null; paid: boolean; note: string | null },
    items: ReceivedNoteItem[]
  ): Promise<ReceivedNote> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    if (!items.length) throw new Error('Phiếu nhập cần ít nhất một sản phẩm.');

    const total = items.reduce((s, i) => s + i.qty * i.cost, 0);
    const { data, error } = await this.sb
      .from('received_notes')
      .insert({
        shop_id: shopId,
        code: this.newCode(),
        supplier_name: input.supplier_name,
        total,
        items,
        paid: input.paid,
        note: input.note,
      })
      .select()
      .single();
    if (error) throw error;

    // Tăng tồn kho cho từng sản phẩm
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
        console.error('stock update failed for', item.name, e);
      }
    }

    // Ghi nhận chi tiền nếu đã trả nhà cung cấp
    if (input.paid && total > 0) {
      await this.transactionsService.create({
        type: 'expense',
        category: 'Nhập hàng',
        amount: total,
        note: `Nhập hàng ${data.code}${input.supplier_name ? ' — ' + input.supplier_name : ''}`,
        occurred_at: new Date().toISOString(),
      });
    }

    return data as ReceivedNote;
  }

  async remove(note: ReceivedNote): Promise<void> {
    // Hoàn lại tồn kho trước khi xóa
    for (const item of note.items ?? []) {
      if (!item.product_id) continue;
      try {
        const product = await this.productsService.get(item.product_id);
        if (product) {
          await this.productsService.update(item.product_id, {
            stock: Math.max(0, Number(product.stock ?? 0) - item.qty),
          });
        }
      } catch (e) {
        console.error('stock revert failed for', item.name, e);
      }
    }
    const { error } = await this.sb
      .from('received_notes')
      .delete()
      .eq('id', note.id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }
}

import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { safeIlikeTerm } from '../utils/postgrest-search';

export interface ReceivedNoteItem {
  product_id: string | null;
  name: string;
  qty: number;
  cost: number;
  /** Số lượng ĐẶT (v29 — partial receipt): nhận thiếu → phiếu rơi vào "Chờ nhập thêm". */
  qty_ordered?: number;
}

export type ReceivedNoteStatus = 'pending' | 'partial' | 'completed' | 'cancelled';

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
  supplier_id?: string | null;
  paid_amount?: number;
  due_date?: string | null;
  /** v29: maker-checker + partial receipt */
  status?: ReceivedNoteStatus;
  parent_id?: string | null;
  created_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  reject_reason?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ReceivedNotesService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);

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
      const term = `%${safeIlikeTerm(search)}%`;
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
    input: {
      supplier_name: string | null;
      paid: boolean;
      note: string | null;
      supplier_id?: string | null;
      paid_amount?: number;
      due_date?: string | null;
      /** v29: phiếu "nhập tiếp phần thiếu" tham chiếu phiếu gốc. */
      parent_id?: string | null;
    },
    items: ReceivedNoteItem[]
  ): Promise<ReceivedNote> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    if (!items.length) throw new Error('Phiếu nhập cần ít nhất một sản phẩm.');

    const total = items.reduce((s, i) => s + i.qty * i.cost, 0);
    const paidAmount = Math.max(0, Math.min(Number(input.paid_amount ?? (input.paid ? total : 0)), total));
    const note = {
      code: this.newCode(),
      supplier_name: input.supplier_name,
      paid: input.paid,
      note: input.note,
      supplier_id: input.supplier_id ?? null,
      paid_amount: paidAmount,
      due_date: input.due_date || null,
      parent_id: input.parent_id ?? null,
    };
    const { data, error } = await this.sb.client.rpc('inv_create_received_note', {
      p_shop: shopId, p_note: note, p_items: items, p_nonce: crypto.randomUUID(),
    });
    if (error) {
      if (error.code === 'PGRST202' || /inv_create_received_note|schema cache/i.test(error.message)) {
        throw new Error('Cơ sở dữ liệu chưa có migration v34. Hãy cập nhật database trước khi nhập kho.');
      }
      throw error;
    }
    return data as ReceivedNote;
  }

  private debtColumnsPromise: Promise<boolean> | null = null;
  /** Dò 1 lần (cache) xem received_notes đã có cột v28 chưa. */
  private detectDebtColumns(): Promise<boolean> {
    this.debtColumnsPromise ??= (async () => {
      if (!this.sb.isConfigured) return false;
      const { error } = await this.sb.from('received_notes').select('id, paid_amount, due_date, supplier_id').limit(1);
      return !error;
    })();
    return this.debtColumnsPromise;
  }

  private v29ColumnsPromise: Promise<boolean> | null = null;
  /** Dò 1 lần (cache) xem received_notes đã có cột v29 (status/parent_id/created_by) chưa. */
  private detectV29Columns(): Promise<boolean> {
    this.v29ColumnsPromise ??= (async () => {
      if (!this.sb.isConfigured) return false;
      const { error } = await this.sb.from('received_notes').select('id, status, parent_id, created_by').limit(1);
      return !error;
    })();
    return this.v29ColumnsPromise;
  }

  async remove(note: ReceivedNote): Promise<void> {
    const neverApplied = note.status === 'pending' || note.status === 'cancelled';
    if (!neverApplied) {
      throw new Error('Phiếu đã ghi sổ không thể xóa. Hãy tạo phiếu điều chỉnh/đảo nghiệp vụ để giữ lịch sử.');
    }
    const { error } = await this.sb
      .from('received_notes')
      .delete()
      .eq('id', note.id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }
}

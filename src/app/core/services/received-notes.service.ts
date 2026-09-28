import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { TransactionsService } from './transactions.service';
import { ProductsService } from './products.service';
import { InventoryLedgerService } from './inventory-ledger.service';

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
  private transactionsService = inject(TransactionsService);
  private productsService = inject(ProductsService);
  private ledger = inject(InventoryLedgerService);

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

    // v29 — maker-checker: người KHÔNG có quyền duyệt (nhân viên) chỉ được
    // tạo phiếu 'pending' — chưa ghi tồn/tiền/công nợ, chờ chủ shop duyệt.
    // Có quyền duyệt: nhận thiếu so với số đặt → 'partial', đủ → 'completed'.
    const canApprove = this.auth.can('inventory_approve');
    const hasShort = items.some((i) => Number(i.qty_ordered ?? i.qty) > Number(i.qty));
    const wantStatus: ReceivedNoteStatus = !canApprove ? 'pending' : hasShort ? 'partial' : 'completed';

    // Dò cột v28 (supplier_id/paid_amount/due_date) — chưa chạy migration thì gửi payload cũ
    let row: Record<string, unknown> = {
      shop_id: shopId,
      code: this.newCode(),
      supplier_name: input.supplier_name,
      total,
      items,
      paid: input.paid,
      note: input.note,
    };
    if (await this.detectDebtColumns()) {
      row = {
        ...row,
        supplier_id: input.supplier_id ?? null,
        paid_amount: paidAmount,
        due_date: input.due_date || null,
      };
    }
    // Dò cột v29 (status/parent_id/created_by) — chưa chạy thì mọi phiếu ghi ngay như cũ
    const v29 = await this.detectV29Columns();
    if (v29) {
      row = {
        ...row,
        status: wantStatus,
        parent_id: input.parent_id ?? null,
        created_by: this.auth.session()?.user?.id ?? null,
      };
    }
    const isPending = v29 && wantStatus === 'pending';

    const { data, error } = await this.sb
      .from('received_notes')
      .insert(row)
      .select()
      .single();
    if (error) throw error;

    // Phiếu CHỜ DUYỆT: dừng ở đây — tồn kho/tiền/công nợ chỉ ghi khi được duyệt
    // (RPC inv_approve_note làm tất cả trong 1 transaction).
    if (isPending) return data as ReceivedNote;

    // Tăng tồn kho QUA SỔ CÁI (v27): 1 transaction, idempotent, có audit.
    // Fallback khi migration v27 chưa chạy: cộng client-side từng dòng (cũ).
    const applied = await this.ledger.applyNote('received_note', data.id, items);
    if (!applied) await this.legacyApplyStock(items);

    // Ghi nhận chi tiền phần ĐÃ TRẢ (toàn bộ nếu trả đủ, một phần nếu nợ)
    if (paidAmount > 0) {
      await this.transactionsService.create({
        type: 'expense',
        category: 'Nhập hàng',
        amount: paidAmount,
        note: `Nhập hàng ${data.code}${input.supplier_name ? ' — ' + input.supplier_name : ''}`,
        occurred_at: new Date().toISOString(),
      });
    }

    // Công nợ NCC (AP) cho phần chưa trả — v28; chưa chạy migration thì bỏ qua
    const remain = total - paidAmount;
    if (input.supplier_id && remain > 0) {
      try {
        const { error: debtError } = await this.sb.from('supplier_debts').insert({
          shop_id: shopId,
          supplier_id: input.supplier_id,
          received_note_id: data.id,
          amount: remain,
          paid_amount: 0,
          due_date: input.due_date || null,
          status: 'open',
          note: `Nhập hàng ${data.code}`,
          created_by: this.auth.displayName(),
        });
        if (debtError) throw debtError;
      } catch (e: any) {
        if (String(e?.code ?? '') === '42P01' || /relation .* does not exist|Could not find the table/i.test(String(e?.message))) {
          console.warn('[debt] v28 chưa chạy — bỏ qua tạo công nợ NCC', e);
        } else {
          throw e;
        }
      }
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

  /** Đường cũ (chỉ dùng khi v27 chưa chạy): cộng tồn client-side từng dòng. */
  private async legacyApplyStock(items: ReceivedNoteItem[]): Promise<void> {
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
  }

  async remove(note: ReceivedNote): Promise<void> {
    // Phiếu pending/cancelled (v29) CHƯA BAO GIỜ ghi tồn → xoá thẳng, không đảo.
    const neverApplied = note.status === 'pending' || note.status === 'cancelled';
    // Hoàn tồn kho QUA SỔ CÁI (đảo dấu các dòng ledger của phiếu)
    const reversed = neverApplied ? true : await this.ledger.reverseNote('received_note', note.id);
    if (!reversed && !neverApplied) {
      // Fallback cũ: hoàn tồn client-side trước khi xoá
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
    }
    const { error } = await this.sb
      .from('received_notes')
      .delete()
      .eq('id', note.id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }
}

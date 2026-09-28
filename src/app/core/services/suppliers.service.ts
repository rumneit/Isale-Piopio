import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

/**
 * Nhà cung cấp + Công nợ phải trả NCC (AP) — migration v28.
 * Khi v28 chưa chạy: các hàm trả về rỗng / ném lỗi PGRST202 được nuốt an toàn
 * (cờ `v28Ready` để UI ẩn tính năng thay vì lỗi).
 */
export interface Supplier {
  id: string;
  shop_id: string;
  name: string;
  phone: string | null;
  note: string | null;
  created_at: string;
}

export interface SupplierDebt {
  id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_phone: string | null;
  received_note_id: string | null;
  received_code: string | null;
  amount: number;
  paid_amount: number;
  remaining: number;
  due_date: string | null;
  status: 'open' | 'partial' | 'paid' | 'cancelled';
  note: string | null;
  created_at: string;
}

export interface DebtPayment {
  id: string;
  amount: number;
  occurred_at: string;
  note: string | null;
  account_id: string | null;
}

@Injectable({ providedIn: 'root' })
export class SuppliersService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);

  /** true khi RPC v28 trả lời bình thường ít nhất 1 lần */
  v28Ready = false;

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  private isMissingRpc(e: any): boolean {
    const msg = String(e?.message ?? e ?? '');
    return String(e?.code ?? '') === 'PGRST202' || /Could not find the function|sup_debts|sup_pay_debt|schema cache/i.test(msg);
  }

  async list(): Promise<Supplier[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('suppliers')
      .select('*')
      .order('name');
    if (error) {
      // bảng chưa tồn tại (v28 chưa chạy)
      console.warn('[suppliers] chưa có bảng suppliers (v28 chưa chạy?)', error.message);
      return [];
    }
    return (data ?? []) as Supplier[];
  }

  async create(input: { name: string; phone: string | null; note: string | null }): Promise<Supplier> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const { data, error } = await this.sb
      .from('suppliers')
      .insert({ shop_id: shopId, name: input.name.trim(), phone: input.phone, note: input.note })
      .select()
      .single();
    if (error) throw error;
    return data as Supplier;
  }

  async update(id: string, patch: Partial<Pick<Supplier, 'name' | 'phone' | 'note'>>): Promise<void> {
    const { error } = await this.sb.from('suppliers').update(patch).eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('suppliers').delete().eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  /** Danh sách nợ còn lại (open/partial), sắp theo hạn gần nhất trước. */
  async debts(): Promise<SupplierDebt[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    try {
      const { data, error } = await this.sb.client.rpc('sup_debts', { p_shop: this.shopId, p_status: null });
      if (error) throw error;
      this.v28Ready = true;
      return ((data ?? []) as any[]).map((d) => ({ ...d, remaining: Number(d.remaining ?? 0) }));
    } catch (e) {
      if (this.isMissingRpc(e)) {
        console.warn('[suppliers] v28 chưa chạy — ẩn công nợ NCC', e);
        return [];
      }
      throw e;
    }
  }

  /** Trả tiền 1 khoản nợ (idempotent theo nonce). Trả id giao dịch chi. */
  async payDebt(debtId: string, amount: number, accountId: string | null, note: string | null): Promise<string> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const { data, error } = await this.sb.client.rpc('sup_pay_debt', {
      p_shop: shopId,
      p_debt_id: debtId,
      p_amount: amount,
      p_account_id: accountId,
      p_note: note,
      p_nonce: nonce,
    });
    if (error) throw error;
    return data as string;
  }

  async debtPayments(debtId: string): Promise<DebtPayment[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    try {
      const { data, error } = await this.sb.client.rpc('sup_debt_payments', {
        p_shop: this.shopId,
        p_debt_id: debtId,
      });
      if (error) throw error;
      return (data ?? []) as DebtPayment[];
    } catch (e) {
      if (this.isMissingRpc(e)) return [];
      throw e;
    }
  }

  /** Tổng nợ còn lại theo NCC (tính từ danh sách debts). */
  debtBySupplier(debts: SupplierDebt[]): Map<string, { total: number; count: number }> {
    const map = new Map<string, { total: number; count: number }>();
    for (const d of debts) {
      const cur = map.get(d.supplier_id) ?? { total: 0, count: 0 };
      cur.total += d.remaining;
      cur.count += 1;
      map.set(d.supplier_id, cur);
    }
    return map;
  }
}

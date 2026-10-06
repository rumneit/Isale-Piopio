import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';
import { Transaction, TradeCategory, RecurringTransaction } from '../models/models';
import { safeIlikeTerm } from '../utils/postgrest-search';

@Injectable({ providedIn: 'root' })
export class TransactionsService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private logService = inject(LogService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  readonly incomeCategories = ['Bán hàng', 'Thu nợ', 'Thu khác'];
  readonly expenseCategories = ['Nhập hàng', 'Chi phí', 'Lương', 'Thuê nhà', 'Marketing', 'Trả nợ', 'Chi khác'];

  /** Hình thức thanh toán (ISale trade.paymentType) */
  readonly paymentTypes = [
    { value: 'CASH', label: 'Tiền mặt' },
    { value: 'BANK', label: 'Chuyển khoản' },
    { value: 'CARD', label: 'Quẹt thẻ' },
    { value: 'E-WALLET', label: 'Ví điện tử' },
    { value: 'OTHER', label: 'Khác' },
  ];

  paymentTypeLabel(value?: string | null): string {
    if (!value || value === 'CASH') return 'Tiền mặt';
    return this.paymentTypes.find((p) => p.value === value)?.label ?? value;
  }

  sourceLabel(source?: string | null): string {
    switch (source) {
      case 'order':
        return 'Đơn hàng';
      case 'debt':
        return 'Công nợ';
      case 'transfer':
        return 'Chuyển nội bộ';
      case 'recurring':
        return 'Định kỳ';
      default:
        return '';
    }
  }

  async list(type: 'all' | 'income' | 'expense' = 'all', search = ''): Promise<Transaction[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('transactions')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('occurred_at', { ascending: false });

    if (type !== 'all') query = query.eq('type', type);
    if (search.trim()) {
      const term = `%${safeIlikeTerm(search)}%`;
      query = query.or(`note.ilike.${term},category.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Transaction[];
  }

  async create(input: Partial<Transaction>): Promise<Transaction> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');
    const { data, error } = await this.sb
      .from('transactions')
      .insert({ ...input, shop_id: shopId })
      .select()
      .single();
    if (error) {
      // Migration v24 chưa chạy -> thử lại với payload cũ (không có cột mới)
      if (TransactionsService.isMissingColumn(error)) {
        const retry = await this.sb
          .from('transactions')
          .insert({ ...this.legacyPayload(input), shop_id: shopId })
          .select()
          .single();
        if (retry.error) throw this.friendly(retry.error);
        const t = retry.data as Transaction;
        this.logService.log('create', 'transaction', `${t.type === 'income' ? 'Thu' : 'Chi'} ${new Intl.NumberFormat('vi-VN').format(t.amount)}₫`);
        return t;
      }
      throw this.friendly(error);
    }
    const t = data as Transaction;
    this.logService.log('create', 'transaction', `${t.type === 'income' ? 'Thu' : 'Chi'} ${new Intl.NumberFormat('vi-VN').format(t.amount)}₫`);
    return t;
  }

  /** Cột mới của v24 — tạm loại nếu DB chưa migrate */
  private static readonly V24_COLUMNS = [
    'contact_id',
    'order_id',
    'debt_id',
    'payment_type',
    'image_urls',
    'source',
    'client_nonce',
  ];

  private legacyPayload<T extends Partial<Transaction>>(input: T): T {
    const clone: any = { ...input };
    for (const col of TransactionsService.V24_COLUMNS) delete clone[col];
    return clone;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('transactions').delete().eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw this.friendly(error);
  }

  async update(id: string, patch: Partial<Transaction>): Promise<void> {
    const { error } = await this.sb
      .from('transactions')
      .update(patch)
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) {
      if (TransactionsService.isMissingColumn(error)) {
        const retry = await this.sb
          .from('transactions')
          .update(this.legacyPayload(patch))
          .eq('id', id)
          .eq('shop_id', this.shopId!);
        if (retry.error) throw this.friendly(retry.error);
        return;
      }
      throw this.friendly(error);
    }
  }

  /** PostgREST: thiếu cột (v24 chưa chạy) */
  static isMissingColumn(error: unknown): boolean {
    const e = error as { code?: string; message?: string };
    if (e?.code === 'PGRST204') return true;
    return /Could not find the '.*' column|column .* does not exist/i.test(e?.message ?? '');
  }

  /** Trigger v24 chặn sửa/xóa giao dịch có nguồn gốc — dịch lỗi cho thân thiện */
  private friendly(error: unknown): Error {
    const msg = (error as { message?: string })?.message ?? 'Thao tác thất bại';
    if (/không thể sửa\/xóa thủ công|transactions_guard/.test(msg)) {
      return new Error('Giao dịch này thuộc đơn hàng/công nợ/hệ thống nên không thể sửa/xóa thủ công.');
    }
    if (/transactions_amount_positive/.test(msg)) {
      return new Error('Số tiền không hợp lệ.');
    }
    return new Error(msg);
  }

  // ================= Danh mục thu/chi động (trade_categories) =================

  async listCategories(type?: 'income' | 'expense'): Promise<TradeCategory[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('trade_categories')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('order_index', { ascending: true });
    if (type) query = query.eq('type', type);
    const { data, error } = await query;
    if (error) {
      if (SupabaseService.isMissingTable(error)) return []; // migration v24 chưa chạy
      throw error;
    }
    return (data ?? []) as TradeCategory[];
  }

  async createCategory(title: string, type: 'income' | 'expense'): Promise<TradeCategory> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const { count } = await this.sb
      .from('trade_categories')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('type', type);
    const { data, error } = await this.sb
      .from('trade_categories')
      .insert({ shop_id: shopId, title: title.trim(), type, order_index: count ?? 0 })
      .select()
      .single();
    if (error) throw error;
    return data as TradeCategory;
  }

  async removeCategory(id: string): Promise<void> {
    const { error } = await this.sb
      .from('trade_categories')
      .delete()
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  // ================= Ảnh biên lai (Storage bucket 'receipts') =================

  async uploadReceipt(file: File): Promise<string> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const compressed = await this.compressImage(file);
    const ext = 'jpg';
    const path = `${shopId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const { error } = await this.sb.client.storage
      .from('receipts')
      .upload(path, compressed, { contentType: 'image/jpeg', upsert: false });
    if (error) {
      if (/not found|Bucket not found/i.test(error.message)) {
        throw new Error('Chưa có bucket "receipts" — hãy chạy migration v24.');
      }
      throw error;
    }
    return this.sb.client.storage.from('receipts').getPublicUrl(path).data.publicUrl;
  }

  /** Nén về JPEG ≤1280px để chặn payload lớn + strip metadata */
  private async compressImage(file: File, maxDim = 1280, quality = 0.82): Promise<Blob> {
    if (!file.type.startsWith('image/')) throw new Error('Chỉ nhận tệp ảnh.');
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Nén ảnh thất bại'))),
        'image/jpeg',
        quality
      )
    );
  }

  // ================= Chuyển tiền nội bộ (RPC atomic, v24) =================

  async transferMoney(fromId: string, toId: string, amount: number, fee: number, note?: string): Promise<void> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const nonce = `tr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const { error } = await this.sb.client.rpc('transfer_money', {
      p_shop: shopId,
      p_from: fromId,
      p_to: toId,
      p_amount: amount,
      p_fee: fee,
      p_note: note ?? null,
      p_nonce: nonce,
    });
    if (error) {
      if (/could not find the function|PGRST202/i.test(error.message ?? '')) {
        throw new Error('Chưa có hàm transfer_money — hãy chạy migration v24.');
      }
      throw this.friendly(error);
    }
    this.logService.log('create', 'transaction', `Chuyển tiền nội bộ ${new Intl.NumberFormat('vi-VN').format(amount)}₫`);
  }

  /** Số dư thực mỗi ví = số dư khai báo + mọi giao dịch liên quan */
  async accountBalances(): Promise<Map<string, number>> {
    const shopId = this.shopId;
    const map = new Map<string, number>();
    if (!this.sb.isConfigured || !shopId) return map;
    const { data, error } = await this.sb.client.rpc('money_account_balances', { p_shop: shopId });
    if (error) {
      if (/could not find the function|PGRST202/i.test(error.message ?? '')) return map;
      throw error;
    }
    for (const row of (data ?? []) as Array<{ account_id: string; total: number }>) {
      map.set(row.account_id, Number(row.total ?? 0));
    }
    return map;
  }

  // ================= Giao dịch định kỳ (recurring_transactions, v24) =================

  async listRecurring(): Promise<RecurringTransaction[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('recurring_transactions')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('day_of_month', { ascending: true });
    if (error) {
      if (SupabaseService.isMissingTable(error)) return [];
      throw error;
    }
    return (data ?? []) as RecurringTransaction[];
  }

  async createRecurring(input: Partial<RecurringTransaction>): Promise<void> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const { error } = await this.sb
      .from('recurring_transactions')
      .insert({ ...input, shop_id: shopId });
    if (error) throw error;
  }

  async updateRecurring(id: string, patch: Partial<RecurringTransaction>): Promise<void> {
    const { error } = await this.sb
      .from('recurring_transactions')
      .update(patch)
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async removeRecurring(id: string): Promise<void> {
    const { error } = await this.sb
      .from('recurring_transactions')
      .delete()
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  /** Tạo giao dịch cho các khoản định kỳ đến hạn trong tháng hiện tại. Trả về số đã tạo. */
  async runDueRecurring(): Promise<number> {
    const shopId = this.shopId;
    if (!shopId) return 0;
    const items = await this.listRecurring();
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const today = now.getDate();
    let created = 0;
    for (const r of items) {
      if (!r.active) continue;
      if (r.last_run_month === ym) continue;
      if (r.day_of_month > today) continue;
      await this.create({
        type: r.type,
        category: r.category,
        amount: Number(r.amount),
        account_id: r.account_id,
        note: r.title,
        payment_type: r.payment_type ?? 'CASH',
        occurred_at: new Date(now.getFullYear(), now.getMonth(), r.day_of_month, 12).toISOString(),
        source: 'recurring',
      });
      await this.updateRecurring(r.id, { last_run_month: ym });
      created++;
    }
    return created;
  }
}

import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';

export type LoanType = 'loan' | 'debt' | 'borrowed' | 'lent' | 'payable' | 'receivable';

export interface Loan {
  id: string;
  shop_id: string;
  type: LoanType;
  party_name: string;
  amount: number;
  paid: boolean;
  note: string | null;
  occurred_at: string;
  created_at: string;
  /** Lai suat % (ISale: debt-add.interest-rate) */
  interest_rate?: number | null;
  /** Ngay den han (ISale: debt-add.maturity-date) */
  maturity_date?: string | null;
  /** Muc (ISale: debt-add.categories) */
  category?: string | null;
}

/** Hu tien khi khoa no duoc tra: 'in' = tien vao, 'out' = tien ra */
export type DebtDirection = 'in' | 'out';

export interface DebtType {
  value: Exclude<LoanType, 'loan' | 'debt'>;
  label: string;
  direction: DebtDirection;
}

/**
 * 4 kieu vay/no theo ISale (i18n debt-add):
 *  - borrowed   "Ban da vay"   : ban di vay -> khi tra la TIEN RA
 *  - lent       "Da vay ban"   : nguoi khac vay ban -> khi tra la TIEN VAO
 *  - payable    "No phai tra"  : no mua hang NCC -> khi tra la TIEN RA
 *  - receivable "No cua khach" : khach mua chia -> khi tra la TIEN VAO
 */
export const DEBT_TYPES: DebtType[] = [
  { value: 'borrowed', label: 'Bạn đã vay', direction: 'out' },
  { value: 'lent', label: 'Đã vay bạn', direction: 'in' },
  { value: 'payable', label: 'Nợ phải trả', direction: 'out' },
  { value: 'receivable', label: 'Nợ của khách', direction: 'in' },
];

@Injectable({ providedIn: 'root' })
export class LoansService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private logService = inject(LogService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  /** Nhan hien thi; tuong thich gia tri cu 'loan'/'debt' */
  typeLabel(type: string): string {
    if (type === 'loan') return 'Bạn đã vay';
    if (type === 'debt') return 'Nợ của khách';
    return DEBT_TYPES.find((t) => t.value === type)?.label ?? type;
  }

  /** Hu tien khi tra (dung de chia tong "con phai thu"/"con phai tra") */
  typeDirection(type: string): DebtDirection {
    if (type === 'loan') return 'out';
    if (type === 'debt') return 'in';
    return DEBT_TYPES.find((t) => t.value === type)?.direction ?? 'in';
  }

  /** Loai giao dich tuong ung khi khoa no duoc tra (ISale debt.paid-alert) */
  settleTransactionType(type: string): 'income' | 'expense' {
    return this.typeDirection(type) === 'in' ? 'income' : 'expense';
  }

  async list(search = ''): Promise<Loan[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('loans')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('occurred_at', { ascending: false });

    if (search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`party_name.ilike.${term},note.ilike.${term},category.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Loan[];
  }

  async create(input: Partial<Loan>): Promise<Loan> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const { data, error } = await this.sb
      .from('loans')
      .insert({ ...input, shop_id: shopId })
      .select()
      .single();
    if (error) throw error;
    const loan = data as Loan;
    this.logService.log('create', 'loan', `${this.typeLabel(loan.type)} - ${loan.party_name}`);
    return loan;
  }

  async setPaid(id: string, paid: boolean): Promise<void> {
    const { error } = await this.sb
      .from('loans')
      .update({ paid })
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
    this.logService.log('update', 'loan', paid ? 'Đánh dấu đã trả' : 'Chuyển về chưa trả');
  }

  async update(id: string, patch: Partial<Loan>): Promise<void> {
    const { error } = await this.sb
      .from('loans')
      .update(patch)
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
    this.logService.log('update', 'loan', patch.party_name ?? '');
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('loans').delete().eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
    this.logService.log('delete', 'loan', '');
  }
}

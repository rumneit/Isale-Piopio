import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { Transaction } from '../models/models';

@Injectable({ providedIn: 'root' })
export class TransactionsService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  readonly incomeCategories = ['Bán hàng', 'Thu nợ', 'Thu khác'];
  readonly expenseCategories = ['Nhập hàng', 'Chi phí', 'Lương', 'Thuê nhà', 'Marketing', 'Chi khác'];

  async list(type: 'all' | 'income' | 'expense' = 'all', search = ''): Promise<Transaction[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('transactions')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('occurred_at', { ascending: false });

    if (type !== 'all') query = query.eq('type', type);
    if (search.trim()) {
      const term = `%${search.trim()}%`;
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
    if (error) throw error;
    return data as Transaction;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('transactions').delete().eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async update(id: string, patch: Partial<Transaction>): Promise<void> {
    const { error } = await this.sb
      .from('transactions')
      .update(patch)
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }
}

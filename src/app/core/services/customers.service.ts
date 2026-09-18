import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { Customer } from '../models/models';

@Injectable({ providedIn: 'root' })
export class CustomersService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  async list(search = '', onlyDebt = false): Promise<Customer[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('customers')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false });

    if (search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`name.ilike.${term},phone.ilike.${term}`);
    }
    if (onlyDebt) query = query.gt('debt', 0).order('debt', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Customer[];
  }

  async get(id: string): Promise<Customer | null> {
    if (!this.sb.isConfigured || !this.shopId) return null;
    const { data, error } = await this.sb
      .from('customers')
      .select('*')
      .eq('id', id)
      .eq('shop_id', this.shopId)
      .maybeSingle();
    if (error) throw error;
    return (data as Customer) ?? null;
  }

  async create(input: Partial<Customer>): Promise<Customer> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');
    const { data, error } = await this.sb
      .from('customers')
      .insert({ ...input, shop_id: shopId })
      .select()
      .single();
    if (error) throw error;
    return data as Customer;
  }

  async update(id: string, input: Partial<Customer>): Promise<void> {
    const { error } = await this.sb.from('customers').update(input).eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('customers').delete().eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  /** Thu nợ: giảm debt của khách + ghi nhận giao dịch thu */
  async addDebtPayment(customer: Customer, amount: number): Promise<void> {
    const newDebt = Math.max(0, Number(customer.debt ?? 0) - amount);
    await this.update(customer.id, { debt: newDebt });
    await this.createIncomeTransaction(`Thu nợ từ ${customer.name}`, amount);
  }

  private async createIncomeTransaction(note: string, amount: number): Promise<void> {
    const { error } = await this.sb.from('transactions').insert({
      shop_id: this.shopId,
      type: 'income',
      category: 'Thu nợ',
      amount,
      note,
      occurred_at: new Date().toISOString(),
    });
    if (error) throw error;
  }
}

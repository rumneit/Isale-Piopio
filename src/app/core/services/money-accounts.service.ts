import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { MoneyAccount } from '../models/models';

@Injectable({ providedIn: 'root' })
export class MoneyAccountsService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  readonly accountTypes = [
    { value: 'cash', label: 'Tiền mặt' },
    { value: 'bank', label: 'Ngân hàng' },
    { value: 'e-wallet', label: 'Ví điện tử' },
  ];

  typeLabel(type: string): string {
    return this.accountTypes.find((t) => t.value === type)?.label ?? type;
  }

  async list(): Promise<MoneyAccount[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('money_accounts')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as MoneyAccount[];
  }

  async create(name: string, type: string, balance: number): Promise<void> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const { error } = await this.sb
      .from('money_accounts')
      .insert({ shop_id: shopId, name: name.trim(), type, balance });
    if (error) throw error;
  }

  async update(id: string, patch: Partial<MoneyAccount>): Promise<void> {
    const { error } = await this.sb
      .from('money_accounts')
      .update(patch)
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb
      .from('money_accounts')
      .delete()
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }
}

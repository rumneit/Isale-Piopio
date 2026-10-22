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

  async create(name: string, type: string, balance: number, isDefault = false): Promise<void> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    if (isDefault) await this.clearDefault(shopId);
    const payload: Record<string, unknown> = {
      shop_id: shopId, name: name.trim(), type, balance, is_default: isDefault,
    };
    let { error } = await this.sb.from('money_accounts').insert(payload);
    if (error && /is_default|schema cache/i.test(error.message)) {
      delete payload['is_default'];
      ({ error } = await this.sb.from('money_accounts').insert(payload));
    }
    if (error) throw error;
  }

  async update(id: string, patch: Partial<MoneyAccount>): Promise<void> {
    if (patch.is_default) await this.clearDefault(this.shopId!, id);
    const payload = { ...patch };
    let { error } = await this.sb
      .from('money_accounts')
      .update(payload)
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error && /is_default|schema cache/i.test(error.message)) {
      delete (payload as Partial<MoneyAccount>).is_default;
      ({ error } = await this.sb
        .from('money_accounts')
        .update(payload)
        .eq('id', id)
        .eq('shop_id', this.shopId!));
    }
    if (error) throw error;
  }

  /** Chỉ một ví mặc định mỗi cửa hàng (unique index v41). */
  private async clearDefault(shopId: string, exceptId?: string): Promise<void> {
    let query = this.sb
      .from('money_accounts')
      .update({ is_default: false })
      .eq('shop_id', shopId)
      .eq('is_default', true);
    if (exceptId) query = query.neq('id', exceptId);
    const { error } = await query;
    // Cột is_default chưa có (migration v41 chưa chạy) — bỏ qua.
    if (error && !/is_default|schema cache/i.test(error.message)) throw error;
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

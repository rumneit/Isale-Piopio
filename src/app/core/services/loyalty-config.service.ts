import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';
import { PointConfigRule, LoyaltyTierRule } from '../loyalty';

export type { PointConfigRule, LoyaltyTierRule } from '../loyalty';

/**
 * Quản lý cấu hình tích điểm và cấu hình thăng hạng của shop.
 * Lịch sử tích điểm đọc từ `point_transactions` (đã có từ trước).
 */
@Injectable({ providedIn: 'root' })
export class LoyaltyConfigService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private logService = inject(LogService);

  /** True khi bảng chưa tồn tại (chưa chạy migration v14). */
  readonly migrationNeeded = signal(false);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  // ---------- Quy tắc tích điểm ----------
  async listPointRules(): Promise<PointConfigRule[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('point_configs')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false });
    if (error) {
      if (SupabaseService.isMissingTable(error)) {
        this.migrationNeeded.set(true);
        return [];
      }
      throw error;
    }
    this.migrationNeeded.set(false);
    return (data ?? []) as PointConfigRule[];
  }

  async savePointRule(input: PointConfigRule & { id?: string }): Promise<void> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const payload = {
      shop_id: shopId,
      name: input.name,
      tier: input.tier,
      spend_per_point: input.spend_per_point,
      redeem_value: input.redeem_value,
      min_order_total: input.min_order_total,
      active: input.active !== false,
    };
    if (input.id) {
      const { error } = await this.sb.from('point_configs').update(payload).eq('id', input.id).eq('shop_id', shopId);
      if (error) throw error;
    } else {
      const { error } = await this.sb.from('point_configs').insert(payload);
      if (error) throw error;
    }
    this.logService.log('update', 'point_config', input.name);
  }

  async removePointRule(id: string): Promise<void> {
    const { error } = await this.sb.from('point_configs').delete().eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  // ---------- Cấu hình thăng hạng ----------
  async listTiers(): Promise<LoyaltyTierRule[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('loyalty_tiers')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('min_spend', { ascending: true });
    if (error) {
      if (SupabaseService.isMissingTable(error)) {
        this.migrationNeeded.set(true);
        return [];
      }
      throw error;
    }
    this.migrationNeeded.set(false);
    return (data ?? []) as LoyaltyTierRule[];
  }

  async saveTier(input: LoyaltyTierRule & { id?: string }): Promise<void> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const payload = {
      shop_id: shopId,
      name: input.name,
      tier: input.tier,
      min_spend: input.min_spend,
      min_points: input.min_points,
      discount_percent: input.discount_percent,
      active: input.active !== false,
      sort_order: input.sort_order ?? 0,
    };
    if (input.id) {
      const { error } = await this.sb.from('loyalty_tiers').update(payload).eq('id', input.id).eq('shop_id', shopId);
      if (error) throw error;
    } else {
      const { error } = await this.sb.from('loyalty_tiers').insert(payload);
      if (error) throw error;
    }
    this.logService.log('update', 'loyalty_tier', input.name);
  }

  async removeTier(id: string): Promise<void> {
    const { error } = await this.sb.from('loyalty_tiers').delete().eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  // ---------- Lịch sử tích điểm ----------
  async recentTransactions(limit = 100): Promise<Array<Record<string, any>>> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('point_transactions')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as Array<Record<string, any>>;
  }
}

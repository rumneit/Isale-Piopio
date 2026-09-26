import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

export interface Promotion {
  id: string;
  shop_id: string;
  name: string;
  type: 'percent' | 'fixed';
  value: number;
  active: boolean;
  note: string | null;
  created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class PromotionsService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  /** Số tiền giảm giá thực tế của một khuyến mãi theo tổng hàng */
  calcDiscount(promo: Promotion, itemsTotal: number): number {
    if (promo.type === 'percent') {
      return Math.round((itemsTotal * Number(promo.value ?? 0)) / 100);
    }
    return Math.min(Number(promo.value ?? 0), itemsTotal);
  }

  typeLabel(type: string): string {
    return type === 'percent' ? 'Giảm theo %' : 'Giảm số tiền cố định';
  }

  describe(promo: Promotion): string {
    return promo.type === 'percent' ? `Giảm ${promo.value}%` : `Giảm ${new Intl.NumberFormat('vi-VN').format(promo.value)}₫`;
  }

  async list(activeOnly = false): Promise<Promotion[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('promotions')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false });
    if (activeOnly) query = query.eq('active', true);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Promotion[];
  }

  async get(id: string): Promise<Promotion | null> {
    if (!this.sb.isConfigured || !this.shopId) return null;
    const { data, error } = await this.sb
      .from('promotions')
      .select('*')
      .eq('id', id)
      .eq('shop_id', this.shopId)
      .maybeSingle();
    if (error) throw error;
    return (data as Promotion) ?? null;
  }

  async create(input: Partial<Promotion>): Promise<Promotion> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const { data, error } = await this.sb
      .from('promotions')
      .insert({ ...input, shop_id: shopId })
      .select()
      .single();
    if (error) throw error;
    return data as Promotion;
  }

  async update(id: string, patch: Partial<Promotion>): Promise<void> {
    const { error } = await this.sb
      .from('promotions')
      .update(patch)
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb
      .from('promotions')
      .delete()
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }
}

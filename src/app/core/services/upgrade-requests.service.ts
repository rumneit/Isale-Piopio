import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

export interface UpgradeRequest {
  id: string;
  shop_id: string;
  plan: string;
  contact_name: string | null;
  contact_phone: string | null;
  note: string | null;
  status: 'pending' | 'contacted' | 'done' | 'cancelled';
  created_at?: string;
}

export const PLANS = [
  { value: 'starter', label: 'Khởi nghiệp', price: 0, features: ['1 cửa hàng', '500 sản phẩm', 'Báo cáo cơ bản'] },
  { value: 'pro', label: 'Chuyên nghiệp', price: 199000, features: ['3 cửa hàng', '10.000 sản phẩm', 'CRM + Tích điểm', 'Báo cáo nâng cao'] },
  { value: 'enterprise', label: 'Doanh nghiệp', price: 499000, features: ['Không giới hạn cửa hàng', 'Không giới hạn SKU', 'Phân quyền nâng cao', 'API & Tích hợp', 'Hỗ trợ ưu tiên'] },
];

@Injectable({ providedIn: 'root' })
export class UpgradeRequestsService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);

  readonly plans = PLANS;

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  planLabel(value: string): string {
    return PLANS.find((p) => p.value === value)?.label ?? value;
  }

  async list(): Promise<UpgradeRequest[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('upgrade_requests')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as UpgradeRequest[];
  }

  async create(input: { plan: string; contact_name: string; contact_phone: string; note: string | null }): Promise<void> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');
    const { error } = await this.sb.from('upgrade_requests').insert({ ...input, shop_id: shopId });
    if (error) throw error;
  }

  async cancel(id: string): Promise<void> {
    const { error } = await this.sb
      .from('upgrade_requests')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }
}

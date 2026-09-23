import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';

export interface ShippingPartner {
  id: string;
  shop_id: string;
  name: string;
  code: string | null;
  phone: string | null;
  api_endpoint: string | null;
  api_token: string | null;
  fee_percent: number;
  active: boolean;
  is_default: boolean;
  note: string | null;
  created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class ShippingPartnersService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private logService = inject(LogService);

  /** True khi bảng chưa tồn tại (chưa chạy migration v14). */
  readonly migrationNeeded = signal(false);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  async list(search = ''): Promise<ShippingPartner[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('shipping_partners')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    if (search.trim()) query = query.ilike('name', `%${search.trim()}%`);
    const { data, error } = await query;
    if (error) {
      if (SupabaseService.isMissingTable(error)) {
        this.migrationNeeded.set(true);
        return [];
      }
      throw error;
    }
    this.migrationNeeded.set(false);
    return (data ?? []) as ShippingPartner[];
  }

  async create(input: Partial<ShippingPartner>): Promise<ShippingPartner> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');
    const { data, error } = await this.sb
      .from('shipping_partners')
      .insert({ ...input, shop_id: shopId })
      .select()
      .single();
    if (error) throw error;
    this.logService.log('create', 'shipping_partner', (data as ShippingPartner).name);
    return data as ShippingPartner;
  }

  async update(id: string, input: Partial<ShippingPartner>): Promise<void> {
    const { error } = await this.sb
      .from('shipping_partners')
      .update(input)
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb
      .from('shipping_partners')
      .delete()
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  /** Đặt một đối tác làm mặc định (bỏ mặc định các đối tác khác). */
  async setDefault(id: string): Promise<void> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const { error: clearError } = await this.sb
      .from('shipping_partners')
      .update({ is_default: false })
      .eq('shop_id', shopId)
      .eq('is_default', true);
    if (clearError) throw clearError;
    const { error } = await this.sb
      .from('shipping_partners')
      .update({ is_default: true })
      .eq('id', id)
      .eq('shop_id', shopId);
    if (error) throw error;
  }
}

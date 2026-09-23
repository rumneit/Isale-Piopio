import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';

export interface SalesChannel {
  id: string;
  shop_id: string;
  name: string;
  type: 'direct' | 'online' | 'marketplace' | 'agent' | 'other';
  fee_percent: number;
  active: boolean;
  created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class SalesChannelsService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private logService = inject(LogService);

  readonly channelTypes = [
    { value: 'direct', label: 'Bán trực tiếp' },
    { value: 'online', label: 'Online / Website' },
    { value: 'marketplace', label: 'Sàn TMĐT' },
    { value: 'agent', label: 'Đại lý' },
    { value: 'other', label: 'Khác' },
  ] as const;

  typeLabel(type: string): string {
    return this.channelTypes.find((t) => t.value === type)?.label ?? type;
  }

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  async list(search = ''): Promise<SalesChannel[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('sales_channels')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false });
    if (search.trim()) query = query.ilike('name', `%${search.trim()}%`);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as SalesChannel[];
  }

  /** Doanh thu theo từng kênh (từ đơn hàng đã gán channel_id). */
  async revenueByChannel(): Promise<Record<string, { orders: number; total: number }>> {
    if (!this.sb.isConfigured || !this.shopId) return {};
    const { data, error } = await this.sb
      .from('orders')
      .select('channel_id,total')
      .eq('shop_id', this.shopId)
      .not('channel_id', 'is', null);
    if (error) throw error;
    const out: Record<string, { orders: number; total: number }> = {};
    for (const row of (data ?? []) as any[]) {
      const cur = out[row.channel_id] ?? { orders: 0, total: 0 };
      cur.orders += 1;
      cur.total += Number(row.total ?? 0);
      out[row.channel_id] = cur;
    }
    return out;
  }

  async create(input: Partial<SalesChannel>): Promise<SalesChannel> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');
    const { data, error } = await this.sb
      .from('sales_channels')
      .insert({ ...input, shop_id: shopId })
      .select()
      .single();
    if (error) throw error;
    this.logService.log('create', 'sales_channel', (data as SalesChannel).name);
    return data as SalesChannel;
  }

  async update(id: string, input: Partial<SalesChannel>): Promise<void> {
    const { error } = await this.sb
      .from('sales_channels')
      .update(input)
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb
      .from('sales_channels')
      .delete()
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }
}

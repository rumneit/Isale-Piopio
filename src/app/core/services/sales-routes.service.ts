import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';

export interface SalesRoute {
  id: string;
  shop_id: string;
  name: string;
  description: string | null;
  color: string;
  active: boolean;
  created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class SalesRoutesService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private logService = inject(LogService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  async list(search = ''): Promise<SalesRoute[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('sales_routes')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false });
    if (search.trim()) query = query.ilike('name', `%${search.trim()}%`);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as SalesRoute[];
  }

  /** Số khách hàng đang thuộc từng tuyến (để hiển thị trên danh sách). */
  async customerCounts(): Promise<Record<string, number>> {
    if (!this.sb.isConfigured || !this.shopId) return {};
    const { data, error } = await this.sb
      .from('customers')
      .select('route_id')
      .eq('shop_id', this.shopId)
      .not('route_id', 'is', null);
    if (error) throw error;
    const counts: Record<string, number> = {};
    for (const row of (data ?? []) as any[]) {
      counts[row.route_id] = (counts[row.route_id] ?? 0) + 1;
    }
    return counts;
  }

  async create(input: Partial<SalesRoute>): Promise<SalesRoute> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');
    const { data, error } = await this.sb
      .from('sales_routes')
      .insert({ ...input, shop_id: shopId })
      .select()
      .single();
    if (error) throw error;
    this.logService.log('create', 'sales_route', (data as SalesRoute).name);
    return data as SalesRoute;
  }

  async update(id: string, input: Partial<SalesRoute>): Promise<void> {
    const { error } = await this.sb
      .from('sales_routes')
      .update(input)
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb
      .from('sales_routes')
      .delete()
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }
}

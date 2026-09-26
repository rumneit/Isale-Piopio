import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

export interface ActivityLog {
  id: string;
  shop_id: string;
  user_name: string;
  action: 'create' | 'update' | 'delete';
  entity: string;
  entity_label: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class LogService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  /** Ghi log thay đổi — không bao giờ làm lỗi nghiệp vụ chính */
  async log(action: ActivityLog['action'], entity: string, label: string): Promise<void> {
    if (!this.sb.isConfigured || !this.shopId) return;
    try {
      await this.sb.from('activity_logs').insert({
        shop_id: this.shopId,
        user_name: this.auth.displayName(),
        action,
        entity,
        entity_label: label,
      });
    } catch (e) {
      console.warn('log failed', e);
    }
  }

  async list(limit = 100): Promise<ActivityLog[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('activity_logs')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as ActivityLog[];
  }
}

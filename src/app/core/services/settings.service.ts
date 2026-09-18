import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);

  /** Cache giá trị settings trong bộ nhớ app */
  readonly values = signal<Record<string, string>>({});
  readonly loaded = signal(false);

  readonly defaultPointRate = 10000;
  readonly defaultLowStockThreshold = 5;

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  async load(): Promise<void> {
    if (!this.sb.isConfigured || !this.shopId) {
      this.values.set({});
      this.loaded.set(true);
      return;
    }
    try {
      const { data, error } = await this.sb
        .from('settings')
        .select('key,value')
        .eq('shop_id', this.shopId);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        map[(row as any).key] = (row as any).value;
      }
      this.values.set(map);
    } catch (e) {
      console.error('load settings failed', e);
      this.values.set({});
    } finally {
      this.loaded.set(true);
    }
  }

  get(key: string): string | null {
    return this.values()[key] ?? null;
  }

  numberValue(key: string, fallback: number): number {
    const raw = this.get(key);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  pointRate(): number {
    return this.numberValue('point_rate', this.defaultPointRate);
  }

  lowStockThreshold(): number {
    return this.numberValue('low_stock_threshold', this.defaultLowStockThreshold);
  }

  async set(key: string, value: string): Promise<void> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const { error } = await this.sb
      .from('settings')
      .upsert({ shop_id: shopId, key, value, updated_at: new Date().toISOString() }, { onConflict: 'shop_id,key' });
    if (error) throw error;
    this.values.update((v) => ({ ...v, [key]: value }));
  }
}

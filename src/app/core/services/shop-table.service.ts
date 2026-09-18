import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

/** Service CRUD generic cho các bảng theo shop (đợt module mở rộng) */
@Injectable({ providedIn: 'root' })
export class ShopTableService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  ready(): boolean {
    return this.sb.isConfigured && !!this.shopId;
  }

  async list<T = any>(table: string, orderBy = 'created_at', ascending = false, search?: { column: string; term: string }): Promise<T[]> {
    if (!this.ready()) return [];
    let query = this.sb
      .from(table)
      .select('*')
      .eq('shop_id', this.shopId!)
      .order(orderBy, { ascending });

    if (search?.term?.trim()) {
      const term = `%${search.term.trim()}%`;
      query = query.or(`${search.column}.ilike.${term}`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as T[];
  }

  async create<T = any>(table: string, row: Record<string, unknown>): Promise<T> {
    if (!this.ready()) throw new Error('Không tìm thấy cửa hàng.');
    const { data, error } = await this.sb
      .from(table)
      .insert({ ...row, shop_id: this.shopId })
      .select()
      .single();
    if (error) throw error;
    return data as T;
  }

  async update(table: string, id: string, patch: Record<string, unknown>): Promise<void> {
    if (!this.ready()) throw new Error('Không tìm thấy cửa hàng.');
    const { error } = await this.sb.from(table).update(patch).eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async remove(table: string, id: string): Promise<void> {
    if (!this.ready()) throw new Error('Không tìm thấy cửa hàng.');
    const { error } = await this.sb.from(table).delete().eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  newCode(prefix: string): string {
    const d = new Date();
    const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `${prefix}-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }
}

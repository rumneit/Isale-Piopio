import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';

export interface ApiToken {
  id: string;
  shop_id: string;
  name: string;
  token: string;
  scopes: string;
  last_used_at: string | null;
  revoked: boolean;
  created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class ApiTokensService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private logService = inject(LogService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  /** Sinh token ngẫu nhiên dạng piopio_<32 hex>. */
  static generateToken(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return 'piopio_' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async list(): Promise<ApiToken[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('api_tokens')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ApiToken[];
  }

  async create(name: string, scopes: string): Promise<ApiToken> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');
    const { data, error } = await this.sb
      .from('api_tokens')
      .insert({ shop_id: shopId, name, token: ApiTokensService.generateToken(), scopes })
      .select()
      .single();
    if (error) throw error;
    this.logService.log('create', 'api_token', name);
    return data as ApiToken;
  }

  async revoke(id: string): Promise<void> {
    const { error } = await this.sb
      .from('api_tokens')
      .update({ revoked: true })
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb
      .from('api_tokens')
      .delete()
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }
}

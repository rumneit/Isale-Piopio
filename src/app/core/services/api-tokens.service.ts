import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';

export interface ApiToken {
  id: string;
  shop_id: string;
  name: string;
  /** Prefix công khai để nhận diện token; không phải secret có thể sử dụng. */
  token_prefix: string;
  /** Chỉ tồn tại trong kết quả create, không được lưu trong database. */
  plain_token?: string;
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

  static async hashToken(token: string): Promise<string> {
    const bytes = new TextEncoder().encode(token);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async list(): Promise<ApiToken[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('api_tokens')
      .select('id, shop_id, name, token_prefix, scopes, last_used_at, revoked, created_at')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ApiToken[];
  }

  async create(name: string, scopes: string): Promise<ApiToken> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');
    const plainToken = ApiTokensService.generateToken();
    const tokenHash = await ApiTokensService.hashToken(plainToken);
    const tokenPrefix = plainToken.slice(0, 14);
    const { data, error } = await this.sb
      .from('api_tokens')
      .insert({ shop_id: shopId, name, token: tokenHash, token_prefix: tokenPrefix, scopes })
      .select('id, shop_id, name, token_prefix, scopes, last_used_at, revoked, created_at')
      .single();
    if (error) throw error;
    this.logService.log('create', 'api_token', name);
    return { ...(data as ApiToken), plain_token: plainToken };
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

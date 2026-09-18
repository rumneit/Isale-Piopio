import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly isConfigured =
    !!environment.supabaseUrl &&
    !environment.supabaseUrl.includes('YOUR-PROJECT') &&
    !!environment.supabaseAnonKey &&
    !environment.supabaseAnonKey.includes('YOUR-ANON');

  private _client: SupabaseClient | null = this.isConfigured
    ? createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;

  get client(): SupabaseClient {
    if (!this._client) {
      throw new Error(
        'Supabase chưa được cấu hình. Hãy điền supabaseUrl và supabaseAnonKey trong src/environments/environment.ts'
      );
    }
    return this._client;
  }

  get auth() {
    return this.client.auth;
  }

  from<T = any>(table: string) {
    return this.client.from(table);
  }
}

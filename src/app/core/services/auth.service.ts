import { Injectable, signal, computed, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Profile, Shop } from '../models/models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly session = signal<any | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly shop = signal<Shop | null>(null);
  readonly initialized = signal(false);

  readonly isLoggedIn = computed(() => !!this.session());
  readonly displayName = computed(() => {
    const p = this.profile();
    const email = this.session()?.user?.email as string | undefined;
    return p?.full_name?.trim() || email?.split('@')[0] || 'Người dùng';
  });

  private sb = inject(SupabaseService);

  constructor() {
    this.init();
  }

  private async init() {
    if (!this.sb.isConfigured) {
      this.initialized.set(true);
      return;
    }
    try {
      const { data } = await this.sb.auth.getSession();
      this.session.set(data.session ?? null);
      if (data.session) {
        await this.loadUserData(data.session.user.id);
      }
      this.sb.auth.onAuthStateChange(async (_event, session) => {
        this.session.set(session);
        if (session) {
          await this.loadUserData(session.user.id);
        } else {
          this.profile.set(null);
          this.shop.set(null);
        }
      });
    } finally {
      this.initialized.set(true);
    }
  }

  private async loadUserData(userId: string) {
    try {
      let { data: profile } = await this.sb
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!profile) {
        const email = this.session()?.user?.email ?? '';
        const inserted = await this.sb
          .from('profiles')
          .upsert({ id: userId, full_name: email.split('@')[0], role: 'owner' }, { onConflict: 'id' })
          .select()
          .maybeSingle();
        profile = inserted.data ?? profile;
      }
      this.profile.set(profile as Profile);

      if (profile?.shop_id) {
        const { data: shop } = await this.sb.from('shops').select('*').eq('id', profile.shop_id).maybeSingle();
        this.shop.set(shop as Shop);
      } else {
        // Auto-provision a shop for the new owner
        const email = this.session()?.user?.email ?? 'Cửa hàng';
        const name = (email.split('@')[0] || 'Cửa hàng của tôi') + ' Store';
        const { data: shop } = await this.sb
          .from('shops')
          .insert({ name, owner_id: userId })
          .select()
          .maybeSingle();
        if (shop) {
          this.shop.set(shop as Shop);
          await this.sb.from('profiles').update({ shop_id: shop.id }).eq('id', userId);
          // default money account
          await this.sb.from('money_accounts').insert({ shop_id: shop.id, name: 'Tiền mặt', type: 'cash', balance: 0 });
        }
      }
    } catch (e) {
      console.error('loadUserData failed', e);
    }
  }

  async login(email: string, password: string) {
    if (!this.sb.isConfigured) {
      throw new Error('Chưa cấu hình Supabase (supabaseUrl / supabaseAnonKey).');
    }
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async register(email: string, password: string, fullName: string) {
    if (!this.sb.isConfigured) {
      throw new Error('Chưa cấu hình Supabase (supabaseUrl / supabaseAnonKey).');
    }
    const { data, error } = await this.sb.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
    return data;
  }

  async logout() {
    if (this.sb.isConfigured) {
      await this.sb.auth.signOut();
    }
    this.session.set(null);
    this.profile.set(null);
    this.shop.set(null);
  }
}

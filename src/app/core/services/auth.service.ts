import { Injectable, signal, computed, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Profile, Shop } from '../models/models';
import { PERMISSION_DEFS, permissionForRoute } from '../permissions';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly session = signal<any | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly shop = signal<Shop | null>(null);
  readonly shopsOwned = signal<Shop[]>([]);
  readonly initialized = signal(false);

  readonly isLoggedIn = computed(() => !!this.session());
  readonly displayName = computed(() => {
    const p = this.profile();
    const email = this.session()?.user?.email as string | undefined;
    return p?.full_name?.trim() || email?.split('@')[0] || 'Người dùng';
  });

  readonly isOwner = computed(() => this.profile()?.role === 'owner');

  /**
   * Kiểm tra quyền của người dùng hiện tại.
   * - Chủ cửa hàng: luôn có toàn quyền.
   * - Chưa có hồ sơ (đang tải / môi trường test): cho phép, tránh khoá nhầm.
   * - Nhân viên: theo cờ quyền đã lưu ở profiles.permissions.
   */
  can(permission: string): boolean {
    const p = this.profile();
    if (!p) return true;
    if (p.role === 'owner') return true;
    const perms = (p.permissions ?? {}) as Record<string, boolean>;
    return !!perms[permission];
  }

  /** Quyền cần có để vào một route (null = không yêu cầu). */
  canAccessRoute(path: string | null | undefined): boolean {
    const perm = permissionForRoute(path);
    return !perm || this.can(perm);
  }

  /** Quyền mặc định khi chưa gán gì cho nhân viên. */
  readonly permissionDefs = PERMISSION_DEFS;

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

      // Danh sách cửa hàng user sở hữu (đa cửa hàng)
      const { data: owned } = await this.sb
        .from('shops')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: true });
      const ownedShops = (owned ?? []) as Shop[];
      this.shopsOwned.set(ownedShops);

      // Xác định shop đang hoạt động: override localStorage > profile.shop_id > shop đầu tiên
      const overrideId = localStorage.getItem('piopio-active-shop');
      let activeShop =
        (overrideId && ownedShops.find((s) => s.id === overrideId)) ||
        (profile?.shop_id ? ownedShops.find((s) => s.id === profile.shop_id) : null) ||
        ownedShops[0] ||
        null;

      if (!activeShop) {
        // Auto-provision a shop for the new owner
        const email = this.session()?.user?.email ?? 'Cửa hàng';
        const name = (email.split('@')[0] || 'Cửa hàng của tôi') + ' Store';
        const { data: shop } = await this.sb
          .from('shops')
          .insert({ name, owner_id: userId })
          .select()
          .maybeSingle();
        if (shop) {
          activeShop = shop as Shop;
          this.shopsOwned.update((list) => [...list, activeShop!]);
          await this.sb.from('profiles').update({ shop_id: shop.id }).eq('id', userId);
          // default money account
          await this.sb.from('money_accounts').insert({ shop_id: shop.id, name: 'Tiền mặt', type: 'cash', balance: 0 });
        }
      }

      if (activeShop) {
        // Nếu profile chưa trỏ đúng shop đang active thì cập nhật (để RLS member hoạt động)
        if (profile && profile.shop_id !== activeShop.id) {
          await this.sb.from('profiles').update({ shop_id: activeShop.id }).eq('id', userId);
        }
        this.shop.set(activeShop);
      }
    } catch (e) {
      console.error('loadUserData failed', e);
    }
  }

  /** Đổi cửa hàng đang hoạt động (dành cho chủ nhiều cửa hàng) */
  async switchShop(shopId: string): Promise<void> {
    if (this.shop()?.id === shopId) return;
    localStorage.setItem('piopio-active-shop', shopId);
    await this.reloadUserData();
    // Tải lại toàn app để mọi trang đọc dữ liệu shop mới
    location.reload();
  }

  /** Tải lại thông tin shop + profile (dùng sau khi cập nhật cài đặt) */
  async reloadUserData() {
    const userId = (this.session() as any)?.user?.id;
    if (userId) {
      await this.loadUserData(userId);
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

  /** Đổi mật khẩu tài khoản đang đăng nhập. */
  async changePassword(newPassword: string): Promise<void> {
    if (!this.sb.isConfigured) {
      throw new Error('Chưa cấu hình Supabase (supabaseUrl / supabaseAnonKey).');
    }
    if (!this.session()) {
      throw new Error('Bạn chưa đăng nhập.');
    }
    if (!newPassword || newPassword.length < 6) {
      throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự.');
    }
    const { error } = await this.sb.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  async logout() {
    if (this.sb.isConfigured) {
      await this.sb.auth.signOut();
    }
    localStorage.removeItem('piopio-active-shop');
    this.session.set(null);
    this.profile.set(null);
    this.shop.set(null);
    this.shopsOwned.set([]);
  }
}

import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { SettingsService } from './settings.service';

export interface AppNotification {
  id: string;
  type: 'stock' | 'debt' | 'order' | 'quote';
  title: string;
  desc: string;
  icon: string;
  color: string;
  path: string;
  date: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private settings = inject(SettingsService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  private readKey(): string {
    return `isale-notif-read-${this.shopId ?? 'anon'}`;
  }

  /** Thời điểm user đọc thông báo lần cuối (localStorage) */
  lastRead(): number {
    return Number(localStorage.getItem(this.readKey()) ?? 0);
  }

  markAllRead(): void {
    localStorage.setItem(this.readKey(), String(Date.now()));
  }

  async build(): Promise<AppNotification[]> {
    const list: AppNotification[] = [];
    if (!this.sb.isConfigured || !this.shopId) return list;
    const shopId = this.shopId;

    try {
      const [productsRes, customersRes, ordersRes, quotesRes] = await Promise.all([
        this.sb.from('products').select('id,name,stock').eq('shop_id', shopId).order('stock', { ascending: true }).limit(200),
        this.sb.from('customers').select('id,name,debt').eq('shop_id', shopId).gt('debt', 0).order('debt', { ascending: false }).limit(50),
        this.sb.from('orders').select('id,code,customer_name,created_at,status').eq('shop_id', shopId).in('status', ['pending', 'shipping']).order('created_at', { ascending: false }).limit(50),
        this.sb.from('orders').select('id,code,customer_name,created_at,total').eq('shop_id', shopId).eq('status', 'quote').order('created_at', { ascending: false }).limit(50),
      ]);

      // 1. Tồn kho thấp
      const threshold = this.settings.lowStockThreshold();
      const lowStock = (productsRes.data ?? []).filter((p: any) => Number(p.stock ?? 0) <= threshold);
      if (lowStock.length > 0) {
        const names = lowStock
          .slice(0, 3)
          .map((p: any) => `${p.name} (${p.stock})`)
          .join(', ');
        list.push({
          id: 'stock-low',
          type: 'stock',
          title: `${lowStock.length} sản phẩm sắp hết hàng`,
          desc: `Tồn kho ≤ ${threshold}: ${names}${lowStock.length > 3 ? '…' : ''}`,
          icon: 'warning-outline',
          color: 'warning',
          path: '/stock-check',
          date: new Date().toISOString(),
        });
      }

      // 2. Công nợ phải thu
      const debtors = customersRes.data ?? [];
      if (debtors.length > 0) {
        const totalDebt = debtors.reduce((s: number, c: any) => s + Number(c.debt ?? 0), 0);
        list.push({
          id: 'debt-total',
          type: 'debt',
          title: `${debtors.length} khách hàng còn nợ`,
          desc: `Tổng công nợ phải thu: ${new Intl.NumberFormat('vi-VN').format(Math.round(totalDebt))}₫`,
          icon: 'document-text-outline',
          color: 'danger',
          path: '/debt',
          date: new Date().toISOString(),
        });
      }

      // 3. Đơn hàng chờ xử lý / đang giao
      const activeOrders = ordersRes.data ?? [];
      if (activeOrders.length > 0) {
        const pending = activeOrders.filter((o: any) => o.status === 'pending').length;
        const shipping = activeOrders.length - pending;
        list.push({
          id: 'orders-active',
          type: 'order',
          title: `${activeOrders.length} đơn hàng đang xử lý`,
          desc: `${pending} chờ xử lý · ${shipping} đang giao`,
          icon: 'boat-outline',
          color: 'primary',
          path: '/delivery',
          date: activeOrders[0]?.created_at ?? new Date().toISOString(),
        });
      }

      // 4. Báo giá chưa chốt
      const quotes = quotesRes.data ?? [];
      if (quotes.length > 0) {
        const names = quotes
          .slice(0, 2)
          .map((q: any) => q.code)
          .join(', ');
        list.push({
          id: 'quotes-open',
          type: 'quote',
          title: `${quotes.length} báo giá chưa chốt`,
          desc: `${names}${quotes.length > 2 ? '…' : ''} — nhấn để xem và chốt đơn`,
          icon: 'receipt-outline',
          color: 'tertiary',
          path: '/quote',
          date: quotes[0]?.created_at ?? new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error('build notifications failed', e);
    }

    return list;
  }

  countUnread(list: AppNotification[]): number {
    const last = this.lastRead();
    return list.filter((n) => new Date(n.date).getTime() > last).length;
  }
}

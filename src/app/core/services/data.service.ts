import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { HomeStats, Order } from '../models/models';

@Injectable({ providedIn: 'root' })
export class DataService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);

  readonly stats = signal<HomeStats | null>(null);
  readonly recentOrders = signal<Order[]>([]);
  readonly loading = signal(false);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  async refreshHome(): Promise<void> {
    if (!this.sb.isConfigured || !this.shopId) {
      this.stats.set(null);
      this.recentOrders.set([]);
      return;
    }
    this.loading.set(true);
    try {
      const shopId = this.shopId;
      const now = new Date();
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [ordersMonth, transMonth, debts, products, customers] = await Promise.all([
        this.sb.from('orders').select('id,total,created_at,code,customer_name,status,paid').eq('shop_id', shopId).gte('created_at', startMonth).order('created_at', { ascending: false }),
        this.sb.from('transactions').select('type,amount,occurred_at').eq('shop_id', shopId).gte('occurred_at', startMonth),
        this.sb.from('customers').select('debt').eq('shop_id', shopId),
        this.sb.from('products').select('id', { count: 'exact', head: true }).eq('shop_id', shopId),
        this.sb.from('customers').select('id', { count: 'exact', head: true }).eq('shop_id', shopId),
      ]);

      const orders: any[] = ordersMonth.data ?? [];
      const trans: any[] = transMonth.data ?? [];
      const debtRows: any[] = debts.data ?? [];

      const revenueMonth = orders.reduce((s, o) => s + (o.total ?? 0), 0);
      const revenueToday = orders
        .filter((o) => o.created_at >= startToday)
        .reduce((s, o) => s + (o.total ?? 0), 0);
      const ordersToday = orders.filter((o) => o.created_at >= startToday).length;
      const expenseMonth = trans.filter((t) => t.type === 'expense').reduce((s, t) => s + (t.amount ?? 0), 0);
      const debtTotal = debtRows.reduce((s, c) => s + (c.debt ?? 0), 0);

      this.stats.set({
        revenueToday,
        revenueMonth,
        expenseMonth,
        ordersToday,
        debtTotal,
        productCount: products.count ?? 0,
        customerCount: customers.count ?? 0,
      });
      this.recentOrders.set(orders.slice(0, 5) as Order[]);
    } catch (e) {
      console.error('refreshHome failed', e);
    } finally {
      this.loading.set(false);
    }
  }
}

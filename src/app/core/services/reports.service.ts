import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

export type ReportRange = 'today' | 'week' | 'month' | 'year';

export interface ReportTopProduct {
  name: string;
  qty: number;
  total: number;
}

export interface ReportDaily {
  date: string;
  revenue: number;
  income: number;
  expense: number;
}

export interface ReportResult {
  revenue: number;
  ordersCount: number;
  income: number;
  expense: number;
  profit: number;
  topProducts: ReportTopProduct[];
  daily: ReportDaily[];
}

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  rangeStart(range: ReportRange): Date {
    const now = new Date();
    switch (range) {
      case 'today':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'week': {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const day = (d.getDay() + 6) % 7; // Monday = 0
        d.setDate(d.getDate() - day);
        return d;
      }
      case 'year':
        return new Date(now.getFullYear(), 0, 1);
      case 'month':
      default:
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }
  }

  rangeLabel(range: ReportRange): string {
    switch (range) {
      case 'today':
        return 'Hôm nay';
      case 'week':
        return 'Tuần này';
      case 'year':
        return 'Năm nay';
      case 'month':
      default:
        return 'Tháng này';
    }
  }

  async getReport(range: ReportRange): Promise<ReportResult> {
    const empty: ReportResult = {
      revenue: 0,
      ordersCount: 0,
      income: 0,
      expense: 0,
      profit: 0,
      topProducts: [],
      daily: [],
    };
    if (!this.sb.isConfigured || !this.shopId) return empty;

    const startIso = this.rangeStart(range).toISOString();

    const [ordersRes, transRes] = await Promise.all([
      this.sb
        .from('orders')
        .select('id,total,created_at')
        .eq('shop_id', this.shopId)
        .gte('created_at', startIso)
        .order('created_at', { ascending: false })
        .limit(2000),
      this.sb
        .from('transactions')
        .select('type,amount,occurred_at')
        .eq('shop_id', this.shopId)
        .gte('occurred_at', startIso)
        .limit(2000),
    ]);

    if (ordersRes.error) throw ordersRes.error;
    if (transRes.error) throw transRes.error;

    const orders: any[] = ordersRes.data ?? [];
    const trans: any[] = transRes.data ?? [];

    const revenue = orders.reduce((s, o) => s + (o.total ?? 0), 0);
    const income = trans.filter((t) => t.type === 'income').reduce((s, t) => s + (t.amount ?? 0), 0);
    const expense = trans.filter((t) => t.type === 'expense').reduce((s, t) => s + (t.amount ?? 0), 0);

    // Top sản phẩm bán chạy
    let topProducts: ReportTopProduct[] = [];
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length) {
      const { data: items, error } = await this.sb
        .from('order_items')
        .select('name,qty,total')
        .in('order_id', orderIds.slice(0, 500));
      if (!error && items) {
        const map = new Map<string, ReportTopProduct>();
        for (const it of items as any[]) {
          const key = it.name ?? 'Khác';
          const cur = map.get(key) ?? { name: key, qty: 0, total: 0 };
          cur.qty += Number(it.qty ?? 0);
          cur.total += Number(it.total ?? 0);
          map.set(key, cur);
        }
        topProducts = [...map.values()].sort((a, b) => b.total - a.total).slice(0, 20);
      }
    }

    // Doanh thu theo ngày
    const dailyMap = new Map<string, ReportDaily>();
    const ensureDay = (iso: string): ReportDaily => {
      const d = new Date(iso);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      let row = dailyMap.get(key);
      if (!row) {
        row = { date: key, revenue: 0, income: 0, expense: 0 };
        dailyMap.set(key, row);
      }
      return row;
    };
    for (const o of orders) ensureDay(o.created_at).revenue += o.total ?? 0;
    for (const t of trans) {
      const row = ensureDay(t.occurred_at);
      if (t.type === 'income') row.income += t.amount ?? 0;
      else row.expense += t.amount ?? 0;
    }
    const daily = [...dailyMap.values()].sort((a, b) => (a.date < b.date ? 1 : -1));

    return { revenue, ordersCount: orders.length, income, expense, profit: revenue - expense, topProducts, daily };
  }
}

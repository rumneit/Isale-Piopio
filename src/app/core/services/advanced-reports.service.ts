import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { ReportRange } from './reports.service';

export interface CategoryReportRow {
  category: string;
  qty: number;
  total: number;
}

export interface TimelyReportRow {
  bucket: string; // '00'..'23' hoặc 'T2'..'CN'
  revenue: number;
  orders: number;
}

export interface ExcelReportRow {
  code: string;
  created_at: string;
  customer_name: string;
  status: string;
  paid: string;
  item_name: string;
  qty: number;
  price: number;
  total: number;
}

/**
 * Báo cáo nâng cao: theo danh mục, theo thời điểm, và bảng phẳng để xuất Excel/CSV.
 * Dùng chung khoảng thời gian với ReportsService.
 */
@Injectable({ providedIn: 'root' })
export class AdvancedReportsService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  private rangeStart(range: ReportRange): Date {
    const now = new Date();
    switch (range) {
      case 'today':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'week': {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        return d;
      }
      case 'year':
        return new Date(now.getFullYear(), 0, 1);
      case 'month':
      default:
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }
  }

  private async ordersInRange(range: ReportRange): Promise<any[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('orders')
      .select('id,code,total,created_at,customer_name,status,paid')
      .eq('shop_id', this.shopId)
      .gte('created_at', this.rangeStart(range).toISOString())
      .order('created_at', { ascending: false })
      .limit(3000);
    if (error) throw error;
    return (data ?? []) as any[];
  }

  /** Doanh thu theo danh mục sản phẩm. */
  async categoryReport(range: ReportRange): Promise<CategoryReportRow[]> {
    const orders = await this.ordersInRange(range);
    if (!orders.length) return [];
    const ids = orders.map((o) => o.id);

    const [{ data: items }, { data: products }, { data: categories }] = await Promise.all([
      this.sb.from('order_items').select('product_id,qty,total').in('order_id', ids.slice(0, 500)),
      this.sb.from('products').select('id,category_id').eq('shop_id', this.shopId!),
      this.sb.from('categories').select('id,name').eq('shop_id', this.shopId!),
    ]);

    const catByProduct = new Map<string, string>();
    for (const p of (products ?? []) as any[]) catByProduct.set(p.id, p.category_id);
    const nameById = new Map<string, string>();
    for (const c of (categories ?? []) as any[]) nameById.set(c.id, c.name);

    const map = new Map<string, CategoryReportRow>();
    for (const it of (items ?? []) as any[]) {
      const catId = it.product_id ? catByProduct.get(it.product_id) : null;
      const name = (catId && nameById.get(catId)) || 'Chưa phân loại';
      const row = map.get(name) ?? { category: name, qty: 0, total: 0 };
      row.qty += Number(it.qty ?? 0);
      row.total += Number(it.total ?? 0);
      map.set(name, row);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }

  /** Doanh thu theo giờ trong ngày (00–23). */
  async timelyByHour(range: ReportRange): Promise<TimelyReportRow[]> {
    const orders = await this.ordersInRange(range);
    const map = new Map<string, TimelyReportRow>();
    for (let h = 0; h < 24; h++) {
      const k = String(h).padStart(2, '0');
      map.set(k, { bucket: k, revenue: 0, orders: 0 });
    }
    for (const o of orders) {
      const k = String(new Date(o.created_at).getHours()).padStart(2, '0');
      const row = map.get(k)!;
      row.revenue += Number(o.total ?? 0);
      row.orders += 1;
    }
    return [...map.values()];
  }

  /** Doanh thu theo thứ trong tuần (T2–CN). */
  async timelyByWeekday(range: ReportRange): Promise<TimelyReportRow[]> {
    const labels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    const map = new Map<string, TimelyReportRow>();
    for (const l of labels) map.set(l, { bucket: l, revenue: 0, orders: 0 });
    for (const o of await this.ordersInRange(range)) {
      const d = new Date(o.created_at);
      const idx = (d.getDay() + 6) % 7; // Monday = 0
      const row = map.get(labels[idx])!;
      row.revenue += Number(o.total ?? 0);
      row.orders += 1;
    }
    return [...map.values()];
  }

  /** Bảng phẳng chi tiết đơn hàng + dòng sản phẩm để xuất Excel/CSV. */
  async excelReport(range: ReportRange): Promise<ExcelReportRow[]> {
    const orders = await this.ordersInRange(range);
    if (!orders.length) return [];
    const ids = orders.map((o) => o.id);
    const { data: items, error } = await this.sb
      .from('order_items')
      .select('order_id,name,qty,price,total')
      .in('order_id', ids.slice(0, 500));
    if (error) throw error;

    const byOrder = new Map<string, any[]>();
    for (const it of (items ?? []) as any[]) {
      const arr = byOrder.get(it.order_id) ?? [];
      arr.push(it);
      byOrder.set(it.order_id, arr);
    }

    const rows: ExcelReportRow[] = [];
    for (const o of orders) {
      const its = byOrder.get(o.id) ?? [];
      if (!its.length) {
        rows.push({
          code: o.code,
          created_at: o.created_at,
          customer_name: o.customer_name ?? '',
          status: o.status ?? '',
          paid: o.paid ? 'Đã trả' : 'Chưa trả',
          item_name: '',
          qty: 0,
          price: 0,
          total: Number(o.total ?? 0),
        });
        continue;
      }
      for (const it of its) {
        rows.push({
          code: o.code,
          created_at: o.created_at,
          customer_name: o.customer_name ?? '',
          status: o.status ?? '',
          paid: o.paid ? 'Đã trả' : 'Chưa trả',
          item_name: it.name ?? '',
          qty: Number(it.qty ?? 0),
          price: Number(it.price ?? 0),
          total: Number(it.total ?? 0),
        });
      }
    }
    return rows;
  }
}

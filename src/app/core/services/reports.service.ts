import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { CsvExportService } from './csv-export.service';
import { OrdersService } from './orders.service';
import {
  ReportCohortRow,
  ReportExportLog,
  ReportInventoryRow,
  ReportKpis,
  ReportOrderRow,
  ReportPoint,
  ReportTopCustomerRow,
  ReportTopProductRow,
} from '../models/models';

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
  private csv = inject(CsvExportService);

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

  // ==================== v26: tổng hợp server-side qua RPC ====================

  /** Date -> 'YYYY-MM-DD' theo giờ local (không lệch múi giờ như toISOString). */
  dateStr(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  private async rpc<T>(fn: string, params: Record<string, unknown>): Promise<T | null> {
    if (!this.sb.isConfigured || !this.shopId) return null;
    const { data, error } = await this.sb.client.rpc(fn, { p_shop: this.shopId, ...params });
    if (error) throw error;
    return (data ?? null) as T | null;
  }

  /** RPC trả về mảng: chuẩn hóa [] khi payload lạ (phòng hộ PostgREST). */
  private async rpcArray<T>(fn: string, params: Record<string, unknown>): Promise<T[]> {
    const v = await this.rpc<T[]>(fn, params);
    return Array.isArray(v) ? v : [];
  }

  /** KPI kỳ [from..to] + kỳ trước (cùng độ dài) + cùng kỳ năm trước. */
  kpis(from: string, to: string): Promise<ReportKpis | null> {
    return this.rpc<ReportKpis>('report_kpis', { p_from: from, p_to: to });
  }

  /** Chuỗi bucket cho biểu đồ cột. grain: day | week | month. */
  timeseries(grain: 'day' | 'week' | 'month', from: string, to: string): Promise<ReportPoint[]> {
    return this.rpcArray<ReportPoint>('report_timeseries', { p_grain: grain, p_from: from, p_to: to });
  }

  /** Drill-down: hóa đơn trong 1 ngày (phân trang). */
  ordersDay(day: string, limit = 50, offset = 0): Promise<ReportOrderRow[]> {
    return this.rpcArray<ReportOrderRow>('report_orders_day', { p_day: day, p_limit: limit, p_offset: offset });
  }

  topProducts(from: string, to: string, limit = 10, offset = 0): Promise<ReportTopProductRow[]> {
    return this.rpcArray<ReportTopProductRow>('report_top_products', { p_from: from, p_to: to, p_limit: limit, p_offset: offset });
  }

  topCustomers(from: string, to: string, limit = 10, offset = 0): Promise<ReportTopCustomerRow[]> {
    return this.rpcArray<ReportTopCustomerRow>('report_top_customers', { p_from: from, p_to: to, p_limit: limit, p_offset: offset });
  }

  /** Cohort giữ chân khách theo tháng đơn đầu tiên. */
  cohort(months = 12): Promise<ReportCohortRow[]> {
    return this.rpcArray<ReportCohortRow>('report_cohort', { p_months: months });
  }

  /** Tồn kho biến chuyển: bán / hoàn / nhập / chuyển + ước tồn đầu kỳ. */
  inventory(from: string, to: string): Promise<ReportInventoryRow[]> {
    return this.rpcArray<ReportInventoryRow>('report_inventory', { p_from: from, p_to: to });
  }

  /** Ghi audit log khi xuất báo cáo (bảng report_exports, append-only). */
  logExport(kind: string, params: Record<string, unknown>, rows: number): Promise<void> {
    return this.rpc<void>('report_log_export', { p_kind: kind, p_params: params, p_rows: rows }).then(() => undefined);
  }

  exportLogs(limit = 50): Promise<ReportExportLog[]> {
    return this.rpcArray<ReportExportLog>('report_export_logs', { p_limit: limit });
  }

  /**
   * Xuất danh sách đơn hàng trong kỳ ra CSV theo trang 1.000 dòng —
   * không full-scan, có progress, ghi audit log khi xong.
   * Trả về số dòng đã xuất. onProgress(page, totalPages) để render tiến độ.
   */
  async exportOrdersCsv(
    from: string,
    to: string,
    writeRow: (row: (string | number | null | undefined)[]) => void,
    onProgress?: (page: number, totalPages: number) => void,
    cancelled?: () => boolean
  ): Promise<number> {
    if (!this.sb.isConfigured || !this.shopId) return 0;
    // Biên VN (+07:00) -> ISO để Postgres so created_at chính xác theo giờ VN.
    const fromIso = new Date(`${from}T00:00:00+07:00`).toISOString();
    const toIso = new Date(`${to}T23:59:59.999+07:00`).toISOString();
    const PAGE = 1000;
    let page = 0;
    let count = 0;
    let totalEstimate = 0;
    while (true) {
      if (cancelled?.()) throw new Error('CANCELLED');
      const { data, error } = await this.sb
        .from('orders')
        .select('code,created_at,customer_name,status,paid,total,discount')
        .eq('shop_id', this.shopId)
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      for (const o of rows) {
        writeRow([
          String(o['code'] ?? ''),
          this.csv.formatDateTime(String(o['created_at'] ?? '')),
          String(o['customer_name'] ?? ''),
          OrdersService.statusLabel(String(o['status'] ?? '')),
          o['paid'] ? 'Đã thanh toán' : 'Chưa thanh toán',
          Number(o['total'] ?? 0),
          Number(o['discount'] ?? 0),
        ]);
        count++;
      }
      page++;
      if (page === 1) totalEstimate = rows.length < PAGE ? rows.length : -1;
      if (onProgress) onProgress(page, totalEstimate === -1 ? -1 : Math.max(1, Math.ceil(totalEstimate / PAGE)));
      if (rows.length < PAGE) break;
    }
    await this.logExport('orders', { from, to }, count).catch(() => undefined);
    return count;
  }
}

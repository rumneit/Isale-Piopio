import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonBackButton,
  IonIcon,
  IonContent,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonSpinner,
  IonBadge,
  IonNote,
  IonChip,
  IonRefresher,
  IonRefresherContent,
  IonModal,
  IonDatetime,
  IonList,
  IonItem,
  IonMenuButton,
  IonSkeletonText,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  barChartOutline,
  calendarOutline,
  cashOutline,
  chevronBackOutline,
  closeCircleOutline,
  cubeOutline,
  downloadOutline,
  homeOutline,
  peopleOutline,
  receiptOutline,
  readerOutline,
  documentOutline,
  pieChartOutline,
  timeOutline,
  newspaperOutline,
  trendingUpOutline,
  arrowDownOutline,
  arrowUpOutline,
} from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';
import { CsvExportService } from '../../core/services/csv-export.service';
import { OrdersService } from '../../core/services/orders.service';
import { ReportsService } from '../../core/services/reports.service';
import {
  ReportCohortRow,
  ReportInventoryRow,
  ReportKpis,
  ReportOrderRow,
  ReportPoint,
  ReportTopCustomerRow,
  ReportTopProductRow,
  ReportWindowTotals,
} from '../../core/models/models';
import { ReportChartComponent, ReportChartDatum } from '../../core/components/report-chart.component';

type RangeMode = 'today' | 'week' | 'month' | 'year' | 'custom';
type Grain = 'day' | 'month';
type TopTab = 'product' | 'customer';

interface DrillBack {
  mode: RangeMode;
  from: Date;
  to: Date;
  grain: Grain;
}

@Component({
  selector: 'app-report-dashboard',
  templateUrl: './report-dashboard.page.html',
  styleUrls: ['./report-dashboard.page.scss'],
  imports: [
    CommonModule,
    ReportChartComponent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonBackButton,
    IonIcon,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonSpinner,
    IonBadge,
    IonNote,
    IonChip,
    IonRefresher,
    IonRefresherContent,
    IonModal,
    IonDatetime,
    IonList,
    IonItem,
    IonMenuButton,
    IonSkeletonText,
  ],
})
export class ReportDashboardPage implements OnInit {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly reports = inject(ReportsService);
  private readonly csvExport = inject(CsvExportService);

  // ---------- kỳ thời gian ----------
  readonly rangeMode = signal<RangeMode>('month');
  readonly customFrom = signal<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  readonly customTo = signal<Date>(new Date());
  readonly grain = signal<Grain>('day');
  private drillBack: DrillBack | null = null;
  readonly isDrilled = signal(false);

  readonly rangeChips: Array<{ id: RangeMode; label: string }> = [
    { id: 'today', label: 'Hôm nay' },
    { id: 'week', label: 'Tuần' },
    { id: 'month', label: 'Tháng' },
    { id: 'year', label: 'Năm' },
    { id: 'custom', label: 'Tùy chọn' },
  ];

  readonly rangeLabel = computed(() => {
    if (this.rangeMode() === 'custom') {
      const f = this.reports.dateStr(this.customFrom());
      const t = this.reports.dateStr(this.customTo());
      return f === t ? this.vnDate(f) : `${this.vnDate(f)} → ${this.vnDate(t)}`;
    }
    const mode = this.rangeMode();
    if (mode === 'today') return 'Hôm nay';
    if (mode === 'week') return 'Tuần này';
    if (mode === 'year') return `Năm ${new Date().getFullYear()}`;
    return `Tháng ${new Date().getMonth() + 1}/${new Date().getFullYear()}`;
  });

  // ---------- dữ liệu ----------
  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly kpis = signal<ReportKpis | null>(null);
  readonly series = signal<ReportPoint[]>([]);
  readonly topProducts = signal<ReportTopProductRow[]>([]);
  readonly topCustomers = signal<ReportTopCustomerRow[]>([]);
  readonly inventoryRows = signal<ReportInventoryRow[]>([]);
  readonly inventoryShown = signal(15);
  readonly cohortRows = signal<ReportCohortRow[]>([]);
  readonly cohortMode = signal<'pct' | 'gmv'>('pct');

  // ---------- biểu đồ ----------
  readonly chartMetric = signal<'revenue' | 'profit'>('revenue');
  readonly selectedBucket = signal<string | null>(null);

  readonly chartPoints = computed<ReportChartDatum[]>(() => {
    const crossYear = new Set(this.series().map((p) => p.bucket.slice(0, 4))).size > 1;
    return this.series().map((p) => ({
      bucket: p.bucket,
      label: this.bucketLabel(p.bucket, this.grain(), crossYear),
      value: this.chartMetric() === 'revenue' ? Number(p.revenue ?? 0) : Number(p.profit ?? 0),
    }));
  });

  // ---------- tab top ----------
  readonly topTab = signal<TopTab>('product');

  // ---------- sheet drill 1 ngày ----------
  readonly sheetOpen = signal(false);
  readonly sheetDate = signal<string | null>(null);
  readonly sheetLoading = signal(false);
  readonly sheetRows = signal<ReportOrderRow[]>([]);
  readonly sheetTotal = signal(0);
  private sheetOffset = 0;
  private static readonly SHEET_PAGE = 50;

  // ---------- export ----------
  readonly exporting = signal(false);
  readonly exportNote = signal('');
  private exportCancelled = false;

  // ---------- custom range modal ----------
  readonly customOpen = signal(false);
  readonly pickerFrom = signal(this.reports.dateStr(this.customFrom()));
  readonly pickerTo = signal(this.reports.dateStr(this.customTo()));
  readonly todayStr = this.reports.dateStr(new Date());

  // ---------- hub (báo cáo chi tiết) ----------
  readonly hubGroups: Array<{ title: string; items: Array<{ label: string; icon: string; path: string }> }> = [
    {
      title: 'Bán hàng',
      items: [
        { label: 'Tổng hợp theo đơn hàng', icon: 'receipt-outline', path: '/report/orders' },
        { label: 'Tổng hợp theo sản phẩm', icon: 'document-outline', path: '/report/product' },
        { label: 'Tổng hợp theo khách hàng', icon: 'person-outline', path: '/report/customer' },
        { label: 'Biểu đồ doanh thu', icon: 'bar-chart-outline', path: '/report/chart' },
        { label: 'Giờ cao điểm / ngày tuân', icon: 'time-outline', path: '/report/timely' },
        { label: 'Theo danh mục', icon: 'pie-chart-outline', path: '/report/category' },
        { label: 'Danh sách xuất Excel', icon: 'reader-outline', path: '/report/excel' },
      ],
    },
    {
      title: 'Kho & công nợ',
      items: [
        { label: 'Tồn kho & biến chuyển (bản cũ)', icon: 'cube-outline', path: '/report/stock' },
        { label: 'Nhập - xuất tồn kho', icon: 'cube-outline', path: '/report/inout' },
        { label: 'Báo cáo vay/nợ', icon: 'newspaper-outline', path: '/report/debt' },
      ],
    },
  ];

  readonly cur = computed<ReportWindowTotals | null>(() => this.kpis()?.current ?? null);

  constructor() {
    addIcons({
      barChartOutline,
      calendarOutline,
      cashOutline,
      chevronBackOutline,
      closeCircleOutline,
      cubeOutline,
      downloadOutline,
      homeOutline,
      peopleOutline,
      receiptOutline,
      readerOutline,
      documentOutline,
      pieChartOutline,
      timeOutline,
      newspaperOutline,
      trendingUpOutline,
      arrowDownOutline,
      arrowUpOutline,
    });
  }

  ngOnInit(): void {
    void this.reload();
  }

  openHome(): void {
    void this.router.navigateByUrl('/home');
  }

  // ================== kỳ & điều hướng ==================

  private window(): { from: string; to: string } {
    return { from: this.reports.dateStr(this.customFrom()), to: this.reports.dateStr(this.customTo()) };
  }

  vnDate(s: string): string {
    const [y, m, d] = s.split('-');
    return `${Number(d)}/${Number(m)}/${y}`;
  }

  bucketLabel(bucket: string, grain: Grain, crossYear: boolean): string {
    const [, m, d] = bucket.split('-').map(Number);
    if (grain === 'month') return crossYear ? `T${m}/${bucket.slice(2, 4)}` : `T${m}`;
    return `${d}/${m}`;
  }

  private autoGrain(from: Date, to: Date): Grain {
    const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
    return days > 92 ? 'month' : 'day';
  }

  setMode(mode: RangeMode): void {
    if (mode === 'custom') {
      this.pickerFrom.set(this.reports.dateStr(this.customFrom()));
      this.pickerTo.set(this.reports.dateStr(this.customTo()));
      this.customOpen.set(true);
      return;
    }
    const now = new Date();
    this.drillBack = null;
    this.isDrilled.set(false);
    this.rangeMode.set(mode);
    if (mode === 'today') {
      this.customFrom.set(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
      this.customTo.set(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    } else if (mode === 'week') {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      this.customFrom.set(d);
      this.customTo.set(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    } else if (mode === 'year') {
      this.customFrom.set(new Date(now.getFullYear(), 0, 1));
      this.customTo.set(new Date(now.getFullYear(), 11, 31));
    } else {
      this.customFrom.set(new Date(now.getFullYear(), now.getMonth(), 1));
      this.customTo.set(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    }
    this.grain.set(this.autoGrain(this.customFrom(), this.customTo()));
    void this.reload();
  }

  /** Xoay biểu đồ theo ngày/tháng. */
  setGrain(g: string): void {
    const grain = (g === 'month' ? 'month' : 'day') as Grain;
    if (grain === this.grain()) return;
    this.grain.set(grain);
    this.selectedBucket.set(null);
    void this.loadSeries();
  }

  /** Drill từ cột tháng -> cả dashboard zoom vào tháng đó (grain = ngày). */
  onBucketPick(bucket: string): void {
    if (this.grain() === 'month') {
      const [y, m] = bucket.split('-').map(Number);
      this.drillBack = {
        mode: this.rangeMode(),
        from: this.customFrom(),
        to: this.customTo(),
        grain: this.grain(),
      };
      this.isDrilled.set(true);
      this.rangeMode.set('custom');
      this.customFrom.set(new Date(y, m - 1, 1));
      this.customTo.set(new Date(y, m, 0));
      this.grain.set('day');
      this.selectedBucket.set(null);
      void this.reload();
    } else {
      this.selectedBucket.set(bucket);
      void this.openDaySheet(bucket);
    }
  }

  clearDrill(): void {
    if (!this.drillBack) return;
    const back = this.drillBack;
    this.drillBack = null;
    this.isDrilled.set(false);
    this.rangeMode.set(back.mode);
    this.customFrom.set(back.from);
    this.customTo.set(back.to);
    this.grain.set(back.grain);
    void this.reload();
  }

  // ================== load dữ liệu ==================

  async reload(ev?: CustomEvent): Promise<void> {
    this.loadError.set('');
    const { from, to } = this.window();
    this.loading.set(true);
    const [kp, tp, tc, inv, coh] = await Promise.allSettled([
      this.reports.kpis(from, to),
      this.reports.topProducts(from, to, 10, 0),
      this.reports.topCustomers(from, to, 10, 0),
      this.reports.inventory(from, to),
      this.reports.cohort(12),
    ]);
    if (kp.status === 'fulfilled') this.kpis.set(kp.value);
    else this.loadError.set(this.errText(kp.reason));
    this.topProducts.set(tp.status === 'fulfilled' ? (tp.value ?? []) : []);
    this.topCustomers.set(tc.status === 'fulfilled' ? (tc.value ?? []) : []);
    this.inventoryRows.set(inv.status === 'fulfilled' ? (inv.value ?? []) : []);
    this.cohortRows.set(coh.status === 'fulfilled' ? (coh.value ?? []) : []);
    this.inventoryShown.set(15);
    this.loading.set(false);
    await this.loadSeries();
    if (ev && typeof (ev as CustomEvent).detail?.complete === 'function') {
      (ev as CustomEvent).detail.complete();
    }
  }

  private errText(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e ?? 'Lỗi không xác định');
    return /migration|PGRST202|could not find the function|not exist/i.test(msg)
      ? 'Chưa chạy migration v26 trên Supabase — mở supabase-migration-v26.sql và chạy trong SQL Editor.'
      : msg;
  }

  private async loadSeries(): Promise<void> {
    const { from, to } = this.window();
    try {
      const pts = await this.reports.timeseries(this.grain(), from, to);
      this.series.set(pts ?? []);
    } catch (e) {
      this.series.set([]);
      if (!this.loadError()) this.loadError.set(this.errText(e));
    }
  }

  // ================== KPI PoP ==================

  /** Δ% so với kỳ trước / cùng kỳ năm trước. null khi không so sánh được. */
  delta(key: 'revenue' | 'profit' | 'orders', base: 'prev' | 'yoy'): number | null {
    const k = this.kpis();
    if (!k?.current || !k[base]) return null;
    const cur = Number(k.current[key] ?? 0);
    const ref = Number(k[base][key] ?? 0);
    if (ref <= 0) return null;
    return ((cur - ref) / ref) * 100;
  }

  deltaText(v: number | null): string {
    if (v == null) return '—';
    const s = Math.abs(v)
      .toFixed(1)
      .replace('.', ',');
    return `${v >= 0 ? '▲' : '▼'} ${s}%`;
  }

  money(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(Math.round(v ?? 0));
  }

  // ================== sheet drill 1 ngày ==================

  private async openDaySheet(day: string): Promise<void> {
    this.sheetDate.set(day);
    this.sheetRows.set([]);
    this.sheetTotal.set(0);
    this.sheetOffset = 0;
    this.sheetOpen.set(true);
    await this.loadSheetPage();
  }

  private async loadSheetPage(): Promise<void> {
    const day = this.sheetDate();
    if (!day) return;
    this.sheetLoading.set(true);
    try {
      const rows = (await this.reports.ordersDay(day, ReportDashboardPage.SHEET_PAGE, this.sheetOffset)) ?? [];
      this.sheetTotal.set(Number(rows[0]?.total_count ?? rows.length));
      this.sheetRows.set(this.sheetOffset === 0 ? rows : [...this.sheetRows(), ...rows]);
      this.sheetOffset += rows.length;
    } catch {
      this.sheetRows.set([]);
    } finally {
      this.sheetLoading.set(false);
    }
  }

  sheetLoadMore(): void {
    if (!this.sheetLoading() && this.sheetRows().length < this.sheetTotal()) {
      void this.loadSheetPage();
    }
  }

  statusLabelOf(status: string | null): string {
    return OrdersService.statusLabel(status);
  }

  statusColor(status: string | null): string {
    switch (status) {
      case 'completed':
      case 'delivered':
        return 'success';
      case 'cancelled':
        return 'danger';
      case 'shipping':
      case 'processing':
      case 'pending':
        return 'warning';
      default:
        return 'medium';
    }
  }

  openOrder(id: string): void {
    void this.router.navigateByUrl(`/order/${id}`);
  }

  // ================== xuất CSV (P2) ==================

  async exportOrders(): Promise<void> {
    if (this.exporting()) return;
    const { from, to } = this.window();
    this.exporting.set(true);
    this.exportCancelled = false;
    const header = ['Mã đơn', 'Ngày', 'Khách hàng', 'Trạng thái', 'Thanh toán', 'Tổng tiền', 'Giảm giá'];
    const rows: Array<(string | number | null | undefined)[]> = [header];
    try {
      const count = await this.reports.exportOrdersCsv(
        from,
        to,
        (r) => rows.push(r),
        (page) => this.exportNote.set(`Đang tải trang ${page}…`),
        () => this.exportCancelled
      );
      if (count === 0) {
        this.exportNote.set('Không có đơn trong kỳ');
        return;
      }
      this.writeCsvFile(`don-hang-${from}-${to}`, rows);
      this.exportNote.set(`Đã xuất ${count} đơn`);
    } catch (e) {
      this.exportNote.set(e instanceof Error && e.message === 'CANCELLED' ? 'Đã hủy xuất file' : 'Lỗi xuất file');
    } finally {
      this.exporting.set(false);
      setTimeout(() => this.exportNote.set(''), 4000);
    }
  }

  private writeCsvFile(filename: string, rows: Array<(string | number | null | undefined)[]>): void {
    const esc = (v: string | number | null | undefined): string => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = rows.map((r) => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  cancelExport(): void {
    this.exportCancelled = true;
  }

  exportTopProducts(): void {
    const { from, to } = this.window();
    const rows = this.topProducts();
    if (!rows.length) return;
    this.csvExport.export(
      `top-san-pham-${from}-${to}`,
      ['Sản phẩm', 'Đơn vị', 'Số lượng', 'Doanh thu', 'Giá vốn', 'Lợi nhuận', 'Số đơn'],
      rows.map((r) => [r.name, r.unit, r.qty, r.revenue, r.cogs, r.profit, r.orders])
    );
    void this.reports.logExport('products', { from, to }, rows.length).catch(() => undefined);
  }

  exportTopCustomers(): void {
    const { from, to } = this.window();
    const rows = this.topCustomers();
    if (!rows.length) return;
    this.csvExport.export(
      `top-khach-hang-${from}-${to}`,
      ['Khách hàng', 'Số đơn', 'Doanh thu', 'Đơn gần nhất'],
      rows.map((r) => [r.name, r.orders, r.revenue, r.last_order_at ? this.reports.dateStr(new Date(r.last_order_at)) : ''])
    );
    void this.reports.logExport('customers', { from, to }, rows.length).catch(() => undefined);
  }

  exportInventory(): void {
    const { from, to } = this.window();
    const rows = this.inventoryRows();
    if (!rows.length) return;
    this.csvExport.export(
      `ton-kho-bien-chuyen-${from}-${to}`,
      ['Sản phẩm', 'SKU', 'Đơn vị', 'Tồn đầu kỳ (ước tính)', 'Nhập', 'Xuất bán', 'Khách trả', 'Chuyển đi', 'Tồn hiện tại'],
      rows.map((r) => [r.name, r.sku, r.unit, r.est_start, r.received, r.sold, r.returned, r.transferred, r.stock_now])
    );
    void this.reports.logExport('inventory', { from, to }, rows.length).catch(() => undefined);
  }

  // ================== cohort heatmap ==================

  readonly cohortGrid = computed(() => {
    const rows = this.cohortRows();
    if (!rows.length) return null;
    const byCohort = new Map<string, Map<number, ReportCohortRow>>();
    for (const r of rows) {
      let m = byCohort.get(r.cohort_month);
      if (!m) {
        m = new Map<number, ReportCohortRow>();
        byCohort.set(r.cohort_month, m);
      }
      m.set(Number(r.month_n), r);
    }
    const cohorts = [...byCohort.keys()].sort();
    const maxN = Math.min(12, Math.max(...rows.map((r) => Number(r.month_n))));
    const now = new Date();
    const nowIndex = now.getFullYear() * 12 + now.getMonth();
    const grid = cohorts.map((c) => {
      const [y, m] = c.split('-').map(Number);
      const size = Number(byCohort.get(c)?.get(0)?.buyers ?? 0);
      const cells: Array<{ n: number; pct: number; buyers: number; gmv: number; future: boolean }> = [];
      for (let n = 0; n <= maxN; n++) {
        const cell = byCohort.get(c)?.get(n);
        const future = y * 12 + (m - 1) + n > nowIndex;
        cells.push({
          n,
          pct: size > 0 && cell ? Number(cell.buyers) / size : 0,
          buyers: cell ? Number(cell.buyers) : 0,
          gmv: cell ? Number(cell.revenue ?? 0) : 0,
          future,
        });
      }
      return { cohort: c, label: `T${m}/${String(y).slice(2)}`, size, cells };
    });
    const maxGmv = Math.max(1, ...rows.map((r) => Number(r.revenue ?? 0)));
    return { months: Array.from({ length: maxN + 1 }, (_, i) => i), rows: grid, maxGmv };
  });

  cohortCellBg(pct: number, gmv: number): string {
    if (this.cohortMode() === 'gmv') {
      const g = this.cohortGrid();
      const a = g ? Math.min(0.85, 0.06 + (gmv / g.maxGmv) * 0.8) : 0.1;
      return `rgba(56, 128, 255, ${a.toFixed(2)})`;
    }
    const a = Math.min(0.85, 0.06 + pct * 0.8);
    return `rgba(56, 128, 255, ${a.toFixed(2)})`;
  }

  cohortCellText(cell: { pct: number; buyers: number; gmv: number; future: boolean }): string {
    if (cell.future) return '·';
    if (this.cohortMode() === 'gmv') return cell.gmv > 0 ? this.compactMoney(cell.gmv) : '';
    return cell.buyers > 0 ? `${Math.round(cell.pct * 100)}%` : '';
  }

  compactMoney(v: number): string {
    const abs = Math.abs(v);
    const one = (x: number) => x.toFixed(x >= 100 ? 0 : 1).replace('.', ',');
    if (abs >= 1e9) return `${one(abs / 1e9)} tỷ`;
    if (abs >= 1e6) return `${one(abs / 1e6)}tr`;
    if (abs >= 1e3) return `${one(abs / 1e3)}k`;
    return String(Math.round(abs));
  }

  // ================== custom range modal ==================

  customApply(): void {
    let f = this.pickerFrom();
    let t = this.pickerTo();
    if (!f || !t) return;
    if (f > t) [f, t] = [t, f];
    this.drillBack = null;
    this.isDrilled.set(false);
    this.rangeMode.set('custom');
    const [fy, fm, fd] = f.split('-').map(Number);
    const [ty, tm, td] = t.split('-').map(Number);
    this.customFrom.set(new Date(fy, fm - 1, fd));
    this.customTo.set(new Date(ty, tm - 1, td));
    this.grain.set(this.autoGrain(this.customFrom(), this.customTo()));
    this.customOpen.set(false);
    void this.reload();
  }

  customCancel(): void {
    this.customOpen.set(false);
  }

  openHub(path: string): void {
    void this.router.navigateByUrl(path);
  }

  refresh(ev: CustomEvent): void {
    void this.reload(ev);
  }

  get shopName(): string {
    return this.auth.shop()?.name ?? '';
  }
}

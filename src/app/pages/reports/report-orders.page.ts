import { Component, OnInit, inject, signal } from '@angular/core';
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
  IonList,
  IonItem,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { receiptOutline, trendingUpOutline, cartOutline, cashOutline, downloadOutline } from 'ionicons/icons';
import { OrdersService } from '../../core/services/orders.service';
import { CsvExportService } from '../../core/services/csv-export.service';
import { Order } from '../../core/models/models';

type Range = 'today' | 'week' | 'month' | 'year';

@Component({
  selector: 'app-report-orders',
  templateUrl: './report-orders.page.html',
  styleUrls: ['./report-orders.page.scss'],
  imports: [
    CommonModule,
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
    IonList,
    IonItem,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class ReportOrdersPage implements OnInit {
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  private ordersService = inject(OrdersService);
  private csvExport = inject(CsvExportService);

  readonly range = signal<Range>('month');
  readonly loading = signal(true);
  readonly orders = signal<Order[]>([]);

  readonly ranges: { value: Range; label: string }[] = [
    { value: 'today', label: 'Hôm nay' },
    { value: 'week', label: 'Tuần' },
    { value: 'month', label: 'Tháng' },
    { value: 'year', label: 'Năm' },
  ];

  constructor() {
    addIcons({ receiptOutline, trendingUpOutline, cartOutline, cashOutline, downloadOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  private rangeStart(range: Range): Date {
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
      default:
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }
  }

  async load() {
    this.loading.set(true);
    try {
      const all = await this.ordersService.list();
      const start = this.rangeStart(this.range());
      this.orders.set(all.filter((o) => new Date(o.created_at) >= start));
    } catch (e: any) {
      console.error('load report orders failed', e);
      this.orders.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async onRange(ev: CustomEvent) {
    this.range.set(ev.detail.value as Range);
    await this.load();
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  get totalRevenue(): number {
    return this.orders().reduce((s, o) => s + Number(o.total ?? 0), 0);
  }

  get paidCount(): number {
    return this.orders().filter((o) => o.paid).length;
  }

  get debtCount(): number {
    return this.orders().filter((o) => !o.paid).length;
  }

  exportCsv() {
    const rows = this.orders().map((o) => [
      o.code,
      o.customer_name ?? 'Khách lẻ',
      OrdersService.statusLabel(o.status),
      o.paid ? 'Đã trả' : 'Còn nợ',
      this.csvExport.formatMoney(o.total),
      this.csvExport.formatDateTime(o.created_at),
    ]);
    this.csvExport.export('bc-don-hang', ['Mã đơn', 'Khách hàng', 'Trạng thái', 'Thanh toán', 'Tổng tiền', 'Ngày tạo'], rows);
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  statusLabel(status: string | null | undefined): string {
    return OrdersService.statusLabel(status);
  }
}

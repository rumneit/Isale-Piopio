import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonSearchbar,
  IonRefresher,
  IonRefresherContent,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonFab,
  IonFabButton,
  IonSpinner,
  IonBackButton,
  IonSegment,
  IonSegmentButton,
  IonNote,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, cartOutline, checkmarkCircleOutline, alertCircleOutline, downloadOutline } from 'ionicons/icons';
import { OrdersService } from '../../core/services/orders.service';
import { CsvExportService } from '../../core/services/csv-export.service';
import { Order } from '../../core/models/models';

@Component({
  selector: 'app-orders',
  templateUrl: './orders.page.html',
  styleUrls: ['./orders.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSearchbar,
    IonRefresher,
    IonRefresherContent,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonFab,
    IonFabButton,
    IonSpinner,
    IonBackButton,
    IonSegment,
    IonSegmentButton,
    IonNote,
  ],
})
export class OrdersPage implements OnInit {
  private ordersService = inject(OrdersService);
  private csvExport = inject(CsvExportService);
  private router = inject(Router);

  readonly items = signal<Order[]>([]);
  readonly loading = signal(true);
  readonly statusFilter = signal<'all' | 'paid' | 'unpaid'>('all');
  search = '';

  constructor() {
    addIcons({ addOutline, cartOutline, checkmarkCircleOutline, alertCircleOutline, downloadOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.ordersService.list(this.search, this.statusFilter()));
    } catch (e: any) {
      console.error('load orders failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async onSearch(ev: CustomEvent) {
    this.search = (ev.detail as any).value ?? '';
    await this.load();
  }

  async onFilter(ev: CustomEvent) {
    this.statusFilter.set(ev.detail.value as any);
    await this.load();
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  openDetail(item: Order) {
    this.router.navigateByUrl(`/order/${item.id}`);
  }

  openAdd() {
    this.router.navigateByUrl('/order/add');
  }

  exportCsv() {
    const rows = this.items().map((o) => [
      o.code,
      o.customer_name ?? 'Khách lẻ',
      OrdersService.statusLabel(o.status),
      o.paid ? 'Đã trả' : 'Còn nợ',
      this.csvExport.formatMoney(o.total),
      this.csvExport.formatMoney(o.discount),
      this.csvExport.formatDateTime(o.created_at),
    ]);
    this.csvExport.export('don-hang', ['Mã đơn', 'Khách hàng', 'Trạng thái', 'Thanh toán', 'Tổng tiền', 'Giảm giá', 'Ngày tạo'], rows);
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}

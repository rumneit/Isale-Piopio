import { Component, OnInit, inject, signal, computed } from '@angular/core';
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
  IonSpinner,
  IonMenuButton,
  IonBadge,
  ActionSheetController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  homeOutline,
  addCircleOutline,
  ellipsisVertical,
  ellipsisHorizontal,
  funnelOutline,
  searchOutline,
  downloadOutline,
  cloudUploadOutline,
  gridOutline,
  settingsOutline,
  chevronForwardOutline,
  sparklesOutline,
  addOutline,
  fileTrayOutline,
  checkmarkCircleOutline,
} from 'ionicons/icons';
import { FabTrioComponent } from '../../shared/fab-trio/fab-trio.component';
import { OrdersService } from '../../core/services/orders.service';
import { CsvExportService } from '../../core/services/csv-export.service';
import { Order } from '../../core/models/models';

interface MonthTab {
  label: string;
  year: number;
  month: number;
}

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
    IonSpinner,
    IonMenuButton,
    IonBadge,
      FabTrioComponent,
  ],
})
export class OrdersPage implements OnInit {
  private ordersService = inject(OrdersService);
  private csvExport = inject(CsvExportService);
  private router = inject(Router);
  private actionSheetCtrl = inject(ActionSheetController);

  readonly loading = signal(true);
  readonly allOrders = signal<Order[]>([]);
  readonly searchVisible = signal(false);
  search = '';

  readonly monthTabs: MonthTab[] = this.buildMonthTabs();
  readonly selectedMonth = signal(0); // index vào monthTabs
  readonly statusFilter = signal<'all' | 'shipping' | 'completed' | 'cancelled'>('all');

  readonly items = computed(() => {
    const tab = this.monthTabs[this.selectedMonth()];
    let list = this.allOrders().filter((o) => {
      const d = new Date(o.created_at);
      return d.getFullYear() === tab.year && d.getMonth() + 1 === tab.month;
    });
    const sf = this.statusFilter();
    if (sf === 'shipping') list = list.filter((o) => o.status === 'shipping');
    if (sf === 'completed') list = list.filter((o) => o.status === 'completed' || o.status === 'delivered');
    if (sf === 'cancelled') list = list.filter((o) => o.status === 'cancelled');
    return list;
  });

  readonly totalAmount = computed(() => this.items().reduce((s, o) => s + Number(o.total ?? 0), 0));

  constructor() {
    addIcons({
      homeOutline,
      addCircleOutline,
      ellipsisVertical,
      ellipsisHorizontal,
      funnelOutline,
      searchOutline,
      downloadOutline,
      cloudUploadOutline,
      gridOutline,
      settingsOutline,
      chevronForwardOutline,
      sparklesOutline,
      addOutline,
      fileTrayOutline,
      checkmarkCircleOutline,
    });
  }

  ngOnInit(): void {
    this.load();
  }

  private buildMonthTabs(): MonthTab[] {
    const tabs: MonthTab[] = [];
    const now = new Date();
    for (let i = -1; i <= 1; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      tabs.push({
        label: `Tháng ${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
      });
    }
    return tabs;
  }

  async load() {
    this.loading.set(true);
    try {
      this.allOrders.set(await this.ordersService.list(this.search));
    } catch (e: any) {
      console.error('load orders failed', e);
      this.allOrders.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async onSearch(ev: CustomEvent) {
    this.search = (ev.detail as any).value ?? '';
    await this.load();
  }

  toggleSearch() {
    this.searchVisible.update((v) => !v);
    if (!this.searchVisible()) {
      this.search = '';
      this.load();
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  selectMonth(index: number) {
    this.selectedMonth.set(index);
  }

  selectStatus(status: 'all' | 'shipping' | 'completed' | 'cancelled') {
    this.statusFilter.set(status);
  }

  openDetail(order: Order) {
    this.router.navigateByUrl(`/order/${order.id}`);
  }

  openAdd() {
    this.router.navigateByUrl('/order/add');
  }

  openHome() {
    this.router.navigateByUrl('/home');
  }

  openSettings() {
    this.router.navigateByUrl('/config');
  }

  openPath(path: string) {
    this.router.navigateByUrl(path);
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

  async openMoreMenu() {
    const sheet = await this.actionSheetCtrl.create({
      header: 'Thao tác khác',
      buttons: [
        { text: 'Nhập đơn từ Excel', icon: 'cloud-upload-outline', handler: () => this.openPath('/import') },
        { text: 'Cài đặt đơn hàng', icon: 'settings-outline', handler: () => this.openSettings() },
        { text: 'Hủy', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  statusLabel(status: string | null | undefined): string {
    return OrdersService.statusLabel(status);
  }
}

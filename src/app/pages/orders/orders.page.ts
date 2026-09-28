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
  ToastController,
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
  addOutline,
  fileTrayOutline,
  checkmarkCircleOutline,
  checkboxOutline,
  squareOutline,
  closeOutline,
  cubeOutline,
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
  private toastCtrl = inject(ToastController);

  readonly loading = signal(true);
  readonly allOrders = signal<Order[]>([]);
  readonly searchVisible = signal(false);
  search = '';

  readonly monthTabs: MonthTab[] = this.buildMonthTabs();
  readonly selectedMonth = signal(0); // index vào monthTabs
  /** 'all' | 4 tab nhanh | các trạng thái phụ qua nút ••• (như ISale) */
  readonly statusFilter = signal<string>('all');
  /** Chế độ chọn nhiều đơn (ISale: bulk select) */
  readonly selectMode = signal(false);
  readonly selectedIds = signal<Set<string>>(new Set());
  /** Các trạng thái phụ nằm sau nút ••• (ISale: Nháp, Đang xử lý, Công nợ...) */
  readonly extraStatuses = OrdersService.orderStatuses.filter((s) =>
    !['shipping', 'completed', 'cancelled'].includes(s.value)
  );

  readonly items = computed(() => {
    const tab = this.monthTabs[this.selectedMonth()];
    let list = this.allOrders().filter((o) => {
      const d = new Date(o.created_at);
      return d.getFullYear() === tab.year && d.getMonth() + 1 === tab.month;
    });
    const sf = this.statusFilter();
    if (sf === 'shipping') list = list.filter((o) => o.status === 'shipping');
    else if (sf === 'completed') list = list.filter((o) => o.status === 'completed' || o.status === 'delivered');
    else if (sf === 'cancelled') list = list.filter((o) => o.status === 'cancelled');
    else if (sf !== 'all') list = list.filter((o) => o.status === sf);
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
      addOutline,
      fileTrayOutline,
      checkmarkCircleOutline,
      checkboxOutline,
      squareOutline,
      closeOutline,
      cubeOutline,
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

  selectStatus(status: string) {
    this.statusFilter.set(status);
  }

  /** Đang lọc bằng một trạng thái phụ (nút ••• sáng lên như tab) */
  isExtraFilter(): boolean {
    const sf = this.statusFilter();
    return sf !== 'all' && sf !== 'shipping' && sf !== 'completed' && sf !== 'cancelled';
  }

  activeFilterLabel(): string {
    return OrdersService.statusLabel(this.statusFilter());
  }

  /** Nút ••• của dải trạng thái: chọn trạng thái phụ (giống ISale) */
  async openMoreStatuses() {
    const current = this.statusFilter();
    const buttons = this.extraStatuses.map((s) => ({
      text: (current === s.value ? '✓ ' : '') + s.label,
      handler: () => this.selectStatus(s.value),
    }));
    const sheet = await this.actionSheetCtrl.create({
      header: 'Lọc theo trạng thái',
      buttons: [...buttons, { text: 'Tất cả trạng thái', handler: () => this.selectStatus('all') }, { text: 'Đóng', role: 'cancel' }],
    });
    await sheet.present();
  }

  // ---------- Chọn nhiều đơn (ISale bulk) ----------

  toggleSelectMode() {
    this.selectMode.update((v) => !v);
    this.selectedIds.set(new Set());
  }

  toggleSelectOrder(id: string) {
    this.selectedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  selectAllVisible() {
    const all = this.items().map((o) => o.id);
    const current = this.selectedIds();
    const isAll = all.length > 0 && all.every((id) => current.has(id));
    this.selectedIds.set(isAll ? new Set() : new Set(all));
  }

  async bulkChangeStatus() {
    const ids = [...this.selectedIds()];
    if (!ids.length) {
      this.toast('Chưa chọn đơn nào', 'danger');
      return;
    }
    const buttons = OrdersService.orderStatuses.map((s) => ({
      text: s.label,
      handler: async () => {
        try {
          await this.ordersService.bulkUpdateStatus(ids, s.value);
          this.toast(`Đã đổi ${ids.length} đơn sang "${s.label}"`);
          this.selectMode.set(false);
          this.selectedIds.set(new Set());
          await this.load();
        } catch (e: any) {
          this.toast(e?.message ?? 'Đổi trạng thái thất bại', 'danger');
        }
      },
    }));
    const sheet = await this.actionSheetCtrl.create({
      header: `Đổi trạng thái ${ids.length} đơn đã chọn`,
      buttons: [...buttons, { text: 'Hủy', role: 'cancel' }],
    });
    await sheet.present();
  }

  async bulkDelete() {
    const ids = [...this.selectedIds()];
    if (!ids.length) {
      this.toast('Chưa chọn đơn nào', 'danger');
      return;
    }
    const alert = await this.actionSheetCtrl.create({
      header: `Xóa ${ids.length} đơn đã chọn?`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: async () => {
            try {
              await this.ordersService.bulkRemove(ids);
              this.toast(`Đã xóa ${ids.length} đơn`);
              this.selectMode.set(false);
              this.selectedIds.set(new Set());
              await this.load();
            } catch (e: any) {
              this.toast(e?.message ?? 'Xóa thất bại', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
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

  statusColor(status: string | null | undefined): string {
    return OrdersService.statusColor(status);
  }

  paymentLabel(code: string | null | undefined): string {
    return OrdersService.paymentLabel(code);
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 2200, color, position: 'bottom' });
    await t.present();
  }
}

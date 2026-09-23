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
  AlertController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  homeOutline,
  statsChartOutline,
  addCircleOutline,
  ellipsisVertical,
  searchOutline,
  downloadOutline,
  cloudUploadOutline,
  gridOutline,
  settingsOutline,
  chevronForwardOutline,
  chevronBackOutline,
  sparklesOutline,
  addOutline,
  fileTrayOutline,
  trendingUpOutline,
  trendingDownOutline,
  createOutline,
  trashOutline,
} from 'ionicons/icons';
import { FabTrioComponent } from '../../shared/fab-trio/fab-trio.component';
import { TransactionsService } from '../../core/services/transactions.service';
import { CsvExportService } from '../../core/services/csv-export.service';
import { Transaction } from '../../core/models/models';

interface MonthTab {
  label: string;
  year: number;
  month: number;
}

@Component({
  selector: 'app-trades',
  templateUrl: './trades.page.html',
  styleUrls: ['./trades.page.scss'],
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
export class TradesPage implements OnInit {
  private transactionsService = inject(TransactionsService);
  private csvExport = inject(CsvExportService);
  private router = inject(Router);
  private actionSheetCtrl = inject(ActionSheetController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly loading = signal(true);
  readonly allItems = signal<Transaction[]>([]);
  readonly searchVisible = signal(false);
  search = '';

  readonly monthTabs: MonthTab[] = this.buildMonthTabs();
  readonly selectedMonth = signal(0);
  readonly typeFilter = signal<'all' | 'income' | 'expense'>('all');
  readonly page = signal(1);
  readonly pageSize = 20;

  readonly items = computed(() => {
    const tab = this.monthTabs[this.selectedMonth()];
    let list = this.allItems().filter((t) => {
      const d = new Date(t.occurred_at);
      return d.getFullYear() === tab.year && d.getMonth() + 1 === tab.month;
    });
    const tf = this.typeFilter();
    if (tf === 'income') list = list.filter((t) => t.type === 'income');
    if (tf === 'expense') list = list.filter((t) => t.type === 'expense');
    return list;
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.items().length / this.pageSize)));
  readonly pagedItems = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.items().slice(start, start + this.pageSize);
  });

  readonly totalAmount = computed(() => this.items().reduce((s, t) => s + Number(t.amount ?? 0), 0));

  constructor() {
    addIcons({
      homeOutline,
      statsChartOutline,
      addCircleOutline,
      ellipsisVertical,
      searchOutline,
      downloadOutline,
      cloudUploadOutline,
      gridOutline,
      settingsOutline,
      chevronForwardOutline,
      chevronBackOutline,
      sparklesOutline,
      addOutline,
      fileTrayOutline,
      trendingUpOutline,
      trendingDownOutline,
      createOutline,
      trashOutline,
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
      this.allItems.set(await this.transactionsService.list('all', this.search));
    } catch (e: any) {
      console.error('load transactions failed', e);
      this.allItems.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async onSearch(ev: CustomEvent) {
    this.search = (ev.detail as any).value ?? '';
    this.page.set(1);
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
    this.page.set(1);
  }

  async openTypeFilter() {
    const sheet = await this.actionSheetCtrl.create({
      header: 'Loại giao dịch',
      buttons: [
        {
          text: 'Toàn bộ' + (this.typeFilter() === 'all' ? ' ✓' : ''),
          handler: () => this.typeFilter.set('all'),
        },
        {
          text: 'Thu' + (this.typeFilter() === 'income' ? ' ✓' : ''),
          handler: () => this.typeFilter.set('income'),
        },
        {
          text: 'Chi' + (this.typeFilter() === 'expense' ? ' ✓' : ''),
          handler: () => this.typeFilter.set('expense'),
        },
        { text: 'Hủy', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  typeFilterLabel(): string {
    const tf = this.typeFilter();
    return tf === 'all' ? 'Toàn bộ' : tf === 'income' ? 'Thu' : 'Chi';
  }

  nextPage() {
    if (this.page() < this.totalPages()) this.page.update((p) => p + 1);
  }

  prevPage() {
    if (this.page() > 1) this.page.update((p) => p - 1);
  }

  openAdd() {
    this.router.navigateByUrl('/trade/add');
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

  async openItemActions(item: Transaction) {
    const sheet = await this.actionSheetCtrl.create({
      header: item.note || item.category || (item.type === 'income' ? 'Thu' : 'Chi'),
      buttons: [
        { text: 'Sửa giao dịch', icon: 'create-outline', handler: () => this.editItem(item) },
        { text: 'Xóa giao dịch', icon: 'trash-outline', role: 'destructive', handler: () => this.doDelete(item) },
        { text: 'Hủy', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  async editItem(item: Transaction) {
    const alert = await this.alertCtrl.create({
      header: 'Sửa giao dịch',
      inputs: [
        { name: 'amount', type: 'number', value: String(item.amount ?? 0), placeholder: 'Số tiền (₫)' },
        { name: 'note', type: 'text', value: item.note ?? '', placeholder: 'Ghi chú' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Lưu',
          handler: async (data) => {
            const amount = Number(data?.amount ?? 0);
            if (!amount || amount <= 0) {
              this.toast('Số tiền không hợp lệ', 'danger');
              return false;
            }
            try {
              await this.transactionsService.update(item.id, {
                amount,
                note: (data?.note ?? '').trim() || null,
              });
              this.toast('Đã cập nhật giao dịch');
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Cập nhật thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private async doDelete(item: Transaction) {
    try {
      await this.transactionsService.remove(item.id);
      this.toast('Đã xóa giao dịch');
      await this.load();
    } catch (e: any) {
      this.toast(e?.message ?? 'Xóa thất bại', 'danger');
    }
  }

  exportCsv() {
    const rows = this.items().map((t) => [
      t.type === 'income' ? 'Thu' : 'Chi',
      t.category ?? '',
      t.note ?? '',
      this.csvExport.formatMoney(t.amount),
      this.csvExport.formatDateTime(t.occurred_at),
    ]);
    this.csvExport.export('giao-dich', ['Loại', 'Nhóm', 'Ghi chú', 'Số tiền', 'Thời gian'], rows);
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

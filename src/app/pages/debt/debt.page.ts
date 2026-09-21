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
  AlertController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  homeOutline,
  addCircleOutline,
  funnelOutline,
  searchOutline,
  checkboxOutline,
  createOutline,
  downloadOutline,
  cloudUploadOutline,
  gridOutline,
  settingsOutline,
  fileTrayOutline,
  cashOutline,
} from 'ionicons/icons';
import { LoansService, Loan } from '../../core/services/loans.service';
import { CsvExportService } from '../../core/services/csv-export.service';

interface MonthTab {
  label: string;
  year: number;
  month: number;
}

@Component({
  selector: 'app-debt',
  templateUrl: './debt.page.html',
  styleUrls: ['./debt.page.scss'],
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
  ],
})
export class DebtPage implements OnInit {
  readonly loansService = inject(LoansService);
  private csvExport = inject(CsvExportService);
  private router = inject(Router);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly loading = signal(true);
  readonly allItems = signal<Loan[]>([]);
  readonly searchVisible = signal(false);
  search = '';

  readonly monthTabs: MonthTab[] = this.buildMonthTabs();
  readonly selectedMonth = signal(0);
  readonly page = signal(1);
  readonly pageSize = 20;

  readonly items = computed(() => {
    const tab = this.monthTabs[this.selectedMonth()];
    return this.allItems().filter((l) => {
      const d = new Date(l.occurred_at);
      return d.getFullYear() === tab.year && d.getMonth() + 1 === tab.month;
    });
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.items().length / this.pageSize)));
  readonly pagedItems = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.items().slice(start, start + this.pageSize);
  });

  readonly totalAmount = computed(() => this.items().reduce((s, l) => s + Number(l.amount ?? 0), 0));
  readonly unpaidAmount = computed(() =>
    this.items().filter((l) => !l.paid).reduce((s, l) => s + Number(l.amount ?? 0), 0)
  );

  constructor() {
    addIcons({
      homeOutline,
      addCircleOutline,
      funnelOutline,
      searchOutline,
      checkboxOutline,
      createOutline,
      downloadOutline,
      cloudUploadOutline,
      gridOutline,
      settingsOutline,
      fileTrayOutline,
      cashOutline,
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
      this.allItems.set(await this.loansService.list(this.search));
    } catch (e: any) {
      console.error('load loans failed', e);
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

  nextPage() {
    if (this.page() < this.totalPages()) this.page.update((p) => p + 1);
  }

  prevPage() {
    if (this.page() > 1) this.page.update((p) => p - 1);
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

  /** Thêm khoản vay/nợ mới */
  async openAdd() {
    const alert = await this.alertCtrl.create({
      header: 'Thêm khoản vay/nợ',
      inputs: [
        { name: 'party', type: 'text', placeholder: 'Tên người/đối tác *' },
        { name: 'amount', type: 'number', placeholder: 'Số tiền (₫)' },
        { name: 'note', type: 'text', placeholder: 'Ghi chú' },
        { name: 'type', type: 'radio', label: 'Mình đi vay (mình nợ)', value: 'loan', checked: true },
        { name: 'type', type: 'radio', label: 'Cho khách nợ (khách nợ mình)', value: 'debt' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Thêm',
          handler: async (data) => {
            if (!data?.party?.trim()) {
              this.toast('Vui lòng nhập tên đối tác', 'danger');
              return false;
            }
            try {
              await this.loansService.create({
                type: data.type ?? 'loan',
                party_name: data.party.trim(),
                amount: Number(data.amount ?? 0),
                note: data.note?.trim() || null,
                paid: false,
                occurred_at: new Date().toISOString(),
              });
              this.toast('Đã thêm khoản vay/nợ');
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Thêm thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  /** Cập nhật trạng thái Đã trả / ngược lại */
  async togglePaid(loan: Loan, ev?: Event) {
    ev?.stopPropagation();
    try {
      await this.loansService.setPaid(loan.id, !loan.paid);
      this.allItems.update((list) => list.map((l) => (l.id === loan.id ? { ...l, paid: !l.paid } : l)));
      this.toast(loan.paid ? 'Đã chuyển về chưa trả' : 'Đã đánh dấu đã trả');
    } catch (e: any) {
      this.toast(e?.message ?? 'Cập nhật thất bại', 'danger');
    }
  }

  async editLoan(loan: Loan, ev?: Event) {
    ev?.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Sửa khoản vay/nợ',
      inputs: [
        { name: 'party', type: 'text', value: loan.party_name },
        { name: 'amount', type: 'number', value: String(loan.amount) },
        { name: 'note', type: 'text', value: loan.note ?? '' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: async () => {
            try {
              await this.loansService.remove(loan.id);
              this.toast('Đã xóa');
              await this.load();
            } catch (e: any) {
              this.toast(e?.message ?? 'Xóa thất bại', 'danger');
            }
            return true;
          },
        },
        {
          text: 'Lưu',
          handler: async (data) => {
            try {
              await this.loansService.update(loan.id, {
                party_name: data.party?.trim() || loan.party_name,
                amount: Number(data.amount ?? loan.amount),
                note: data.note?.trim() || null,
              });
              this.toast('Đã lưu');
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Lưu thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  exportCsv() {
    const rows = this.items().map((l) => [
      this.loansService.typeLabel(l.type),
      l.party_name,
      this.csvExport.formatMoney(l.amount),
      l.paid ? 'Đã trả' : 'Chưa trả',
      l.note ?? '',
      this.csvExport.formatDateTime(l.occurred_at),
    ]);
    this.csvExport.export('cong-no', ['Loại', 'Đối tác', 'Số tiền', 'Trạng thái', 'Ghi chú', 'Thời gian'], rows);
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

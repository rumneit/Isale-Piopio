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
  IonCheckbox,
  ActionSheetController,
  AlertController,
  ToastController,
  ModalController,
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
  checkboxOutline,
  repeatOutline,
  imageOutline,
  swapHorizontalOutline,
  closeOutline,
} from 'ionicons/icons';
import { FabTrioComponent } from '../../shared/fab-trio/fab-trio.component';
import { TransactionsService } from '../../core/services/transactions.service';
import { CsvExportService } from '../../core/services/csv-export.service';
import { Transaction, RecurringTransaction } from '../../core/models/models';
import { TradeAddPage } from './trade-add.page';

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
    IonCheckbox,
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
  private modalCtrl = inject(ModalController);

  readonly loading = signal(true);
  readonly allItems = signal<Transaction[]>([]);
  readonly searchVisible = signal(false);
  search = '';

  readonly monthTabs: MonthTab[] = this.buildMonthTabs();
  readonly selectedMonth = signal(1); // mặc định tháng hiện tại (giống ISale)
  readonly typeFilter = signal<'all' | 'income' | 'expense'>('all');
  readonly page = signal(1);
  readonly pageSize = 20;

  // Bulk select
  readonly selectMode = signal(false);
  readonly selected = signal<Set<string>>(new Set());

  // Giao dịch định kỳ
  readonly recurring = signal<RecurringTransaction[]>([]);

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

  readonly totalIn = computed(() =>
    this.items().filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount ?? 0), 0)
  );
  readonly totalOut = computed(() =>
    this.items().filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount ?? 0), 0)
  );
  readonly totalAmount = computed(() => this.totalIn() - this.totalOut());

  /** Dự báo cuối tháng: net hiện tại / số ngày đã qua * số ngày trong tháng (chỉ tab tháng hiện tại) */
  readonly forecast = computed(() => {
    const tab = this.monthTabs[this.selectedMonth()];
    const now = new Date();
    const isCurrent = tab.year === now.getFullYear() && tab.month === now.getMonth() + 1;
    if (!isCurrent) return null;
    const daysInMonth = new Date(tab.year, tab.month, 0).getDate();
    const elapsed = now.getDate();
    if (elapsed <= 0) return null;
    return Math.round((this.totalIn() - this.totalOut()) / elapsed * daysInMonth);
  });

  /** Biểu đồ cột thu/chi theo ngày (CSS) */
  readonly dayBars = computed(() => {
    const tab = this.monthTabs[this.selectedMonth()];
    const daysInMonth = new Date(tab.year, tab.month, 0).getDate();
    const byDay = new Map<number, { in: number; out: number }>();
    for (let d = 1; d <= daysInMonth; d++) byDay.set(d, { in: 0, out: 0 });
    for (const t of this.items()) {
      const d = new Date(t.occurred_at);
      if (d.getFullYear() !== tab.year || d.getMonth() + 1 !== tab.month) continue;
      const bucket = byDay.get(d.getDate());
      if (!bucket) continue;
      if (t.type === 'income') bucket.in += Number(t.amount ?? 0);
      else bucket.out += Number(t.amount ?? 0);
    }
    const max = Math.max(1, ...[...byDay.values()].map((v) => Math.max(v.in, v.out)));
    return [...byDay.entries()].map(([day, v]) => ({
      day,
      in: v.in,
      out: v.out,
      inH: Math.round((v.in / max) * 100),
      outH: Math.round((v.out / max) * 100),
    }));
  });

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
      checkboxOutline,
      repeatOutline,
      imageOutline,
      swapHorizontalOutline,
      closeOutline,
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
      this.transactionsService.listRecurring().then((r) => this.recurring.set(r)).catch(() => undefined);
      // P3: tự chạy các khoản định kỳ đến hạn
      this.transactionsService
        .runDueRecurring()
        .then((created) => {
          if (created > 0) {
            this.toast(`Đã tạo ${created} giao dịch định kỳ đến hạn`);
            return this.load();
          }
          return undefined;
        })
        .catch(() => undefined);
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
          text: 'Tiền vào' + (this.typeFilter() === 'income' ? ' ✓' : ''),
          handler: () => this.typeFilter.set('income'),
        },
        {
          text: 'Tiền ra' + (this.typeFilter() === 'expense' ? ' ✓' : ''),
          handler: () => this.typeFilter.set('expense'),
        },
        { text: 'Hủy', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  typeFilterLabel(): string {
    const tf = this.typeFilter();
    return tf === 'all' ? 'Toàn bộ' : tf === 'income' ? 'Tiền vào' : 'Tiền ra';
  }

  nextPage() {
    if (this.page() < this.totalPages()) this.page.update((p) => p + 1);
  }

  prevPage() {
    if (this.page() > 1) this.page.update((p) => p - 1);
  }

  /** Mở form thêm/sửa dạng modal (dùng chung TradeAddPage) */
  async openAdd() {
    const modal = await this.modalCtrl.create({
      component: TradeAddPage,
      componentProps: { asModal: true },
    });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role !== 'backdrop') {
      this.page.set(1);
      await this.load();
    }
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
    if (this.selectMode()) {
      this.toggleSelect(item.id);
      return;
    }
    const systemLinked = (item.source ?? 'manual') !== 'manual';
    const sheet = await this.actionSheetCtrl.create({
      header: item.note || item.category || (item.type === 'income' ? 'Tiền vào' : 'Tiền ra'),
      buttons: [
        ...(systemLinked
          ? []
          : [{ text: 'Sửa giao dịch', icon: 'create-outline', handler: () => this.editItem(item) }]),
        { text: 'Xóa giao dịch', icon: 'trash-outline', role: 'destructive', handler: () => this.doDelete(item) },
        { text: 'Hủy', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  async editItem(item: Transaction) {
    const modal = await this.modalCtrl.create({
      component: TradeAddPage,
      componentProps: { asModal: true, editTarget: item },
    });
    await modal.present();
    await modal.onWillDismiss();
    await this.load();
  }

  // ================= Bulk select =================

  toggleSelectMode() {
    this.selectMode.update((v) => !v);
    this.selected.set(new Set());
  }

  toggleSelect(id: string) {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  isSelected(id: string): boolean {
    return this.selected().has(id);
  }

  get pageAllSelected(): boolean {
    const page = this.pagedItems();
    return page.length > 0 && page.every((i) => this.selected().has(i.id));
  }

  toggleSelectPage() {
    const page = this.pagedItems();
    const all = page.every((i) => this.selected().has(i.id));
    this.selected.update((set) => {
      const next = new Set(set);
      for (const i of page) {
        if (all) next.delete(i.id);
        else next.add(i.id);
      }
      return next;
    });
  }

  async bulkDelete() {
    const ids = [...this.selected()];
    if (!ids.length) return;
    const alert = await this.alertCtrl.create({
      header: 'Xóa giao dịch',
      message: `Xóa ${ids.length} giao dịch đã chọn? Nội dung sẽ không thể khôi phục.`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: async () => {
            let ok = 0;
            let blocked = 0;
            for (const id of ids) {
              try {
                await this.transactionsService.remove(id);
                ok++;
              } catch {
                blocked++;
              }
            }
            this.selected.set(new Set());
            if (blocked) this.toast(`Đã xóa ${ok}, ${blocked} giao dịch hệ thống không thể xóa`, 'warning');
            else this.toast(`Đã xóa ${ok} giao dịch`);
            await this.load();
          },
        },
      ],
    });
    await alert.present();
  }

  async doDelete(item: Transaction) {
    try {
      await this.transactionsService.remove(item.id);
      this.selected.update((set) => {
        const next = new Set(set);
        next.delete(item.id);
        return next;
      });
      this.toast('Đã xóa giao dịch');
      await this.load();
    } catch (e: any) {
      this.toast(e?.message ?? 'Xóa thất bại', 'danger');
    }
  }

  // ================= Giao dịch định kỳ (P3) =================

  async openRecurring() {
    const items = this.recurring();
    const buttons = items.map((r) => ({
      text: `${r.active ? '🔵' : '⚪'} ${r.title} — ${this.formatMoney(r.amount)} / ngày ${r.day_of_month}`,
      handler: () => this.recurringActions(r),
    }));
    const sheet = await this.actionSheetCtrl.create({
      header: 'Giao dịch định kỳ',
      subHeader: 'Tự tạo giao dịch khi đến hạn mỗi tháng',
      buttons: [
        ...buttons,
        { text: '＋ Thêm định kỳ', icon: 'add-outline', handler: () => this.promptAddRecurring() },
        { text: 'Đóng', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async recurringActions(r: RecurringTransaction) {
    const sheet = await this.actionSheetCtrl.create({
      header: r.title,
      buttons: [
        {
          text: r.active ? 'Tạm dừng' : 'Kích hoạt lại',
          icon: r.active ? 'pause-outline' : 'play-outline',
          handler: async () => {
            await this.transactionsService.updateRecurring(r.id, { active: !r.active });
            await this.reloadRecurring();
          },
        },
        {
          text: 'Xóa định kỳ',
          icon: 'trash-outline',
          role: 'destructive',
          handler: async () => {
            await this.transactionsService.removeRecurring(r.id);
            await this.reloadRecurring();
          },
        },
        { text: 'Hủy', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async promptAddRecurring() {
    const alert = await this.alertCtrl.create({
      header: 'Thêm giao dịch định kỳ',
      message: 'Tự động tạo giao dịch vào ngày đã chọn mỗi tháng.',
      inputs: [
        { name: 'title', type: 'text', placeholder: 'Tên (VD: Thuê nhà)' },
        { name: 'amount', type: 'number', placeholder: 'Số tiền (₫)' },
        { name: 'category', type: 'text', placeholder: 'Mục (VD: Thuê nhà)' },
        { name: 'day', type: 'number', placeholder: 'Ngày trong tháng (1-28)', value: '1' },
        { name: 'type', type: 'radio', label: 'Tiền vào', value: 'income' },
        { name: 'type', type: 'radio', label: 'Tiền ra', value: 'expense', checked: true },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Thêm',
          handler: async (data) => {
            const amount = Number(data?.amount ?? 0);
            const title = (data?.title ?? '').trim();
            const day = Math.min(28, Math.max(1, Math.round(Number(data?.day ?? 1))));
            if (!title) {
              this.toast('Nhập tên định kỳ', 'danger');
              return false;
            }
            if (!amount || amount <= 0) {
              this.toast('Số tiền phải lớn hơn 0', 'danger');
              return false;
            }
            try {
              await this.transactionsService.createRecurring({
                title,
                type: (data?.type ?? 'expense') as 'income' | 'expense',
                amount,
                category: (data?.category ?? '').trim() || null,
                day_of_month: day,
                active: true,
              });
              this.toast('Đã thêm định kỳ');
              await this.reloadRecurring();
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

  private async reloadRecurring() {
    try {
      this.recurring.set(await this.transactionsService.listRecurring());
    } catch {
      /* ignore */
    }
  }

  // ================= Xuất CSV =================

  exportCsv() {
    const rows = this.items().map((t) => [
      t.type === 'income' ? 'Tiền vào' : 'Tiền ra',
      t.category ?? '',
      t.note ?? '',
      this.csvExport.formatMoney(t.amount),
      this.transactionsService.paymentTypeLabel(t.payment_type),
      t.account_id ?? '',
      this.transactionsService.sourceLabel(t.source) || 'Thủ công',
      this.csvExport.formatDateTime(t.occurred_at),
    ]);
    this.csvExport.export('giao-dich', ['Loại', 'Mục', 'Ghi chú', 'Số tiền', 'Thanh toán', 'Ví/TK', 'Nguồn', 'Thời gian'], rows);
  }

  sourceLabel(t: Transaction): string {
    return this.transactionsService.sourceLabel(t.source);
  }

  paymentTypeLabel(t: Transaction): string {
    return this.transactionsService.paymentTypeLabel(t.payment_type);
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

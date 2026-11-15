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
  ModalController,
  ActionSheetController,
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
  trashOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import { FabTrioComponent } from '../../shared/fab-trio/fab-trio.component';
import { LoansService, Loan, LoanType, DEBT_TYPES } from '../../core/services/loans.service';
import { CustomersService } from '../../core/services/customers.service';
import { CsvExportService } from '../../core/services/csv-export.service';
import { TransactionsService } from '../../core/services/transactions.service';
import { DebtFormModalComponent } from './debt-form.modal';
import { Customer } from '../../core/models/models';

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
      FabTrioComponent,
  ],
})
export class DebtPage implements OnInit {
  readonly loansService = inject(LoansService);
  private customersService = inject(CustomersService);
  private transactionsService = inject(TransactionsService);
  private csvExport = inject(CsvExportService);
  private router = inject(Router);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private modalCtrl = inject(ModalController);
  private sheetCtrl = inject(ActionSheetController);

  readonly debtTypes = DEBT_TYPES;

  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly viewMode = signal<'receivables' | 'loans'>('receivables');
  readonly debtCustomers = signal<Customer[]>([]);
  customerSearch = '';
  readonly allItems = signal<Loan[]>([]);
  readonly searchVisible = signal(false);
  /** 'all' hoac 1 trong 4 kieu vay/no (ISale debt-report debtType filter) */
  readonly typeFilter = signal<'all' | LoanType>('all');
  /** ISale debt.show-left-only: "Chi hien cac khoan van con no" */
  readonly showLeftOnly = signal(false);
  search = '';

  readonly monthTabs: MonthTab[] = this.buildMonthTabs();
  readonly selectedMonth = signal(0);
  readonly page = signal(1);
  readonly pageSize = 20;

  /** Loc theo thang (co so cho tong ket thang) */
  readonly monthItems = computed(() => {
    const tab = this.monthTabs[this.selectedMonth()];
    return this.allItems().filter((l) => {
      const d = new Date(l.occurred_at);
      return d.getFullYear() === tab.year && d.getMonth() + 1 === tab.month;
    });
  });

  /** Cong bo them loc kieu + chi con no (ISale funnel + show-left-only) */
  readonly items = computed(() =>
    this.monthItems().filter((l) => {
      if (this.typeFilter() !== 'all' && l.type !== this.typeFilter()) return false;
      if (this.showLeftOnly() && l.paid) return false;
      return true;
    })
  );

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.items().length / this.pageSize)));
  readonly pagedItems = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.items().slice(start, start + this.pageSize);
  });

  readonly totalAmount = computed(() => this.items().reduce((s, l) => s + Number(l.amount ?? 0), 0));
  readonly filteredDebtCustomers = computed(() => {
    const term = this.customerSearch.trim().toLocaleLowerCase('vi');
    if (!term) return this.debtCustomers();
    const digits = term.replace(/\D/g, '');
    return this.debtCustomers().filter((customer) => {
      const haystack = `${customer.name} ${customer.contact_person ?? ''} ${customer.address ?? ''}`.toLocaleLowerCase('vi');
      const phone = (customer.phone ?? '').replace(/\D/g, '');
      return haystack.includes(term) || (!!digits && phone.includes(digits));
    });
  });
  readonly totalReceivables = computed(() =>
    this.debtCustomers().reduce((sum, customer) => sum + Number(customer.debt ?? 0), 0)
  );
  /** Con phai thu: cac khoan chua tra, khi tra se TIEN VAO (lent/receivable) */
  readonly leftToCollect = computed(() =>
    this.items()
      .filter((l) => !l.paid && this.loansService.typeDirection(l.type) === 'in')
      .reduce((s, l) => s + Number(l.amount ?? 0), 0)
  );
  /** Con phai tra: cac khoan chua tra, khi tra se TIEN RA (borrowed/payable) */
  readonly leftToPay = computed(() =>
    this.items()
      .filter((l) => !l.paid && this.loansService.typeDirection(l.type) === 'out')
      .reduce((s, l) => s + Number(l.amount ?? 0), 0)
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
      trashOutline,
      alertCircleOutline,
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
    this.loadError.set('');
    try {
      const [customersResult, loansResult] = await Promise.allSettled([
        this.customersService.listAll({ debtMin: 0.000001, sortBy: 'debt', sortDirection: 'desc' }),
        this.loansService.list(this.search),
      ]);
      if (customersResult.status === 'fulfilled') {
        this.debtCustomers.set(customersResult.value.filter((customer) => Number(customer.debt ?? 0) > 0));
      } else {
        throw customersResult.reason;
      }
      if (loansResult.status === 'fulfilled') this.allItems.set(loansResult.value);
      else console.error('load other loans failed', loansResult.reason);
    } catch (e: any) {
      console.error('load debts failed', e);
      this.loadError.set(e?.message ?? 'Không tải được dữ liệu công nợ.');
    } finally {
      this.loading.set(false);
    }
  }

  setViewMode(mode: 'receivables' | 'loans') {
    this.viewMode.set(mode);
    this.page.set(1);
  }

  onCustomerSearch(ev: CustomEvent) {
    this.customerSearch = String((ev.detail as any).value ?? '');
  }

  openCustomer(customer: Customer) {
    this.router.navigateByUrl(`/contact/detail/${customer.id}`);
  }

  async collectDebt(customer: Customer, ev?: Event) {
    ev?.stopPropagation();
    const debt = Number(customer.debt ?? 0);
    const alert = await this.alertCtrl.create({
      header: `Thu nợ — ${customer.name}`,
      message: `Dư nợ hiện tại: ${this.formatMoney(debt)}`,
      inputs: [
        { name: 'amount', type: 'number', min: 1, max: debt, value: String(debt), placeholder: 'Số tiền thu *' },
        { name: 'note', type: 'text', placeholder: 'Ghi chú (không bắt buộc)' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Ghi nhận thu',
          handler: (data) => {
            const amount = Number(data.amount);
            if (!Number.isFinite(amount) || amount <= 0 || amount > debt + 0.5) return false;
            void this.confirmCollection(customer, amount, String(data.note ?? ''));
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async confirmCollection(customer: Customer, amount: number, note: string) {
    try {
      const balance = await this.customersService.adjustDebt(customer.id, amount, 'payment', note);
      this.debtCustomers.update((list) =>
        list
          .map((item) => (item.id === customer.id ? { ...item, debt: balance } : item))
          .filter((item) => Number(item.debt ?? 0) > 0)
      );
      await this.toast(`Đã thu ${this.formatMoney(amount)} từ ${customer.name}`);
    } catch (e: any) {
      await this.toast(e?.message ?? 'Ghi nhận thu nợ thất bại', 'danger');
      await this.load();
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

  setTypeFilter(value: 'all' | LoanType) {
    this.typeFilter.set(value);
    this.page.set(1);
  }

  toggleLeftOnly() {
    this.showLeftOnly.update((v) => !v);
    this.page.set(1);
  }

  /** ISale funnel: chon kieu vay/no */
  async openFilter() {
    const current = this.typeFilter();
    const buttons = [
      {
        text: `Tất cả${current === 'all' ? ' ✓' : ''}`,
        handler: () => this.setTypeFilter('all'),
      },
      ...DEBT_TYPES.map((t) => ({
        text: `${t.label}${current === t.value ? ' ✓' : ''}`,
        handler: () => this.setTypeFilter(t.value),
      })),
      {
        text: this.showLeftOnly() ? 'Bỏ lọc "Chỉ còn nợ"' : 'Chỉ hiện các khoản vẫn còn nợ',
        handler: () => this.toggleLeftOnly(),
      },
    ];
    const sheet = await this.sheetCtrl.create({
      header: 'Lọc vay/nợ',
      buttons: [...buttons, { text: 'Đóng', role: 'cancel' }],
    });
    await sheet.present();
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

  /** Mo form Them/Sua vay-no (modal dong bo ISale debt-add) */
  async openAdd() {
    await this.presentForm();
  }

  async editLoan(loan: Loan, ev?: Event) {
    ev?.stopPropagation();
    await this.presentForm(loan);
  }

  private async presentForm(loan?: Loan) {
    const modal = await this.modalCtrl.create({
      component: DebtFormModalComponent,
      componentProps: loan ? { loan } : {},
    });
    await modal.present();
    const { role, data } = await modal.onWillDismiss();
    if (role !== 'save' || !data?.payload) return;
    try {
      if (loan) {
        await this.loansService.update(loan.id, data.payload);
        this.toast('Đã lưu');
      } else {
        await this.loansService.create(data.payload);
        this.toast('Đã thêm khoản vay/nợ');
      }
      await this.load();
    } catch (e: any) {
      this.toast(e?.message ?? 'Lưu thất bại', 'danger');
    }
  }

  /** Xoa khoan vay/no (ISale debt.delete-alert) */
  async deleteLoan(loan: Loan, ev?: Event) {
    ev?.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Xóa khoản vay/nợ',
      message: 'Nội dung của vay/nợ sẽ không thể khôi phục. Bạn có chắc muốn xóa?',
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
          },
        },
      ],
    });
    await alert.present();
  }

  /** Cap nhat trang thai Da tra / nguoc lai (ISale debt.confirm-paid + paid-alert) */
  async togglePaid(loan: Loan, ev?: Event) {
    ev?.stopPropagation();
    const target = !loan.paid;
    const confirm = await this.alertCtrl.create({
      header: 'Xác nhận',
      message: `Bạn có chắc sẽ đổi công nợ này sang trạng thái ${target ? 'Đã trả' : 'Chưa trả'}?`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        { text: 'Đồng ý', role: 'confirm' },
      ],
    });
    await confirm.present();
    const { role } = await confirm.onWillDismiss();
    if (role !== 'confirm') return;

    try {
      await this.loansService.setPaid(loan.id, target);
      this.allItems.update((list) => list.map((l) => (l.id === loan.id ? { ...l, paid: target } : l)));
      this.toast(target ? 'Đã đánh dấu đã trả' : 'Đã chuyển về chưa trả');
    } catch (e: any) {
      this.toast(e?.message ?? 'Cập nhật thất bại', 'danger');
      return;
    }

    if (!target) return;
    // ISale debt.paid-alert: tao giao dich tuong ung (thu/chi) khi tra no
    const ask = await this.alertCtrl.create({
      header: 'Đã trả',
      message: 'Khoản vay/nợ này đã được trả và không còn hiện trong các báo cáo vay/nợ. Bạn có muốn tạo một giao dịch tương ứng?',
      buttons: [
        { text: 'Để sau', role: 'cancel' },
        { text: 'Tạo giao dịch', role: 'confirm' },
      ],
    });
    await ask.present();
    const { role: askRole } = await ask.onWillDismiss();
    if (askRole !== 'confirm') return;
    try {
      const type = this.loansService.settleTransactionType(loan.type);
      await this.transactionsService.create({
        type,
        category: type === 'income' ? 'Thu nợ' : 'Trả nợ',
        amount: Number(loan.amount ?? 0),
        note: `${this.loansService.typeLabel(loan.type)} - ${loan.party_name}`,
        occurred_at: new Date().toISOString(),
        debt_id: loan.id,
        source: 'debt',
      });
      this.toast('Đã tạo giao dịch tương ứng');
    } catch (e: any) {
      this.toast(e?.message ?? 'Tạo giao dịch thất bại', 'danger');
    }
  }

  /** Qua han: chua tra + qua ngay den han */
  isOverdue(loan: Loan): boolean {
    if (loan.paid || !loan.maturity_date) return false;
    const d = new Date(loan.maturity_date);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  }

  exportCsv() {
    const rows = this.items().map((l) => [
      this.loansService.typeLabel(l.type),
      l.party_name,
      this.csvExport.formatMoney(l.amount),
      l.category ?? '',
      l.interest_rate != null ? `${l.interest_rate}%` : '',
      l.maturity_date ? this.csvExport.formatDateTime(l.maturity_date) : '',
      l.paid ? 'Đã trả' : 'Chưa trả',
      l.note ?? '',
      this.csvExport.formatDateTime(l.occurred_at),
    ]);
    this.csvExport.export(
      'cong-no',
      ['Kiểu', 'Đối tác', 'Số tiền', 'Mục', 'Lãi suất', 'Ngày đến hạn', 'Trạng thái', 'Ghi chú', 'Thời gian'],
      rows
    );
  }

  exportCustomerDebts() {
    const rows = this.filteredDebtCustomers().map((customer) => [
      customer.name,
      customer.contact_person ?? '',
      customer.phone ?? '',
      customer.address ?? '',
      this.csvExport.formatMoney(customer.debt),
    ]);
    this.csvExport.export(
      'cong-no-khach-hang',
      ['Tên quán / khách hàng', 'Người mua hàng', 'SĐT', 'Địa chỉ', 'Còn nợ'],
      rows
    );
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

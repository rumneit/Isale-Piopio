import { Component, OnInit, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonInput,
  IonSpinner,
  IonSelect,
  IonSelectOption,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonFab,
  IonFabButton,
  ActionSheetController,
  ToastController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  checkmarkOutline,
  addOutline,
  barcodeOutline,
  listOutline,
  qrCodeOutline,
  closeOutline,
  removeOutline,
  trashOutline,
  searchOutline,
  chevronBackOutline,
  chevronForwardOutline,
  receiptOutline,
  refreshOutline,
  personOutline,
  walletOutline,
  readerOutline,
} from 'ionicons/icons';
import { ProductsService } from '../../core/services/products.service';
import { OrdersService } from '../../core/services/orders.service';
import { CustomersService } from '../../core/services/customers.service';
import { TransactionsService } from '../../core/services/transactions.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/services/auth.service';
import { Product, Customer, MoneyAccount, Profile } from '../../core/models/models';
import { MoneyAccountsService } from '../../core/services/money-accounts.service';

interface SaleItem {
  product_id: string | null;
  name: string;
  unit: string | null;
  price: number;
  qty: number;
}

@Component({
  selector: 'app-sale',
  templateUrl: './sale.page.html',
  styleUrls: ['./sale.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonInput,
    IonSpinner,
    IonSelect,
    IonSelectOption,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonFab,
    IonFabButton,
    FormsModule,
  ],
})
export class SalePage implements OnInit {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  private productsService = inject(ProductsService);
  private ordersService = inject(OrdersService);
  private customersService = inject(CustomersService);
  private transactionsService = inject(TransactionsService);
  private moneyAccountsService = inject(MoneyAccountsService);
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private actionSheetCtrl = inject(ActionSheetController);
  private toastCtrl = inject(ToastController);

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly products = signal<Product[]>([]);
  readonly customers = signal<Customer[]>([]);
  readonly accounts = signal<MoneyAccount[]>([]);
  readonly staff = signal<Profile[]>([]);
  readonly items = signal<SaleItem[]>([]);

  // Tab chính
  readonly tab = signal<'payment' | 'customer' | 'note' | 'shipping'>('payment');
  // Danh sách sản phẩm (hiển thị sẵn) + phân trang
  readonly pickerPage = signal(1);
  readonly pickerSearch = signal('');
  readonly pickerPageSize = 12;

  // Thông tin đơn
  orderCode = '';
  orderDate = new Date().toISOString();
  selectedCustomerId: string | null = null;
  selectedCustomerName = '';
  selectedAccountId: string | null = null;
  selectedStaffId: string | null = null;
  status = 'completed';
  customerShipPaid = false;
  discountPercent: number | null = 0;
  taxPercent: number | null = 0;
  customerPaid: number | null = 0;
  /** Hình thức thanh toán (ISale) — lưu khi cột payment_method có trong DB (v17) */
  paymentMethod = 'Tiền mặt';
  hasPaymentMethodColumn = false;
  readonly paymentMethods = ['Tiền mặt', 'Chuyển khoản', 'Thẻ', 'Ví điện tử'];
  note = '';
  shippingNote = '';
  barcodeInput = '';

  readonly pickerFiltered = computed(() => {
    const raw = this.pickerSearch().trim();
    const term = SalePage.norm(raw);
    const list = this.products();
    if (!term) return list;
    return list.filter(
      (p) =>
        SalePage.norm(p.name).includes(term) ||
        SalePage.norm(p.sku ?? '').includes(term) ||
        (p.barcode ?? '').includes(raw)
    );
  });

  /** Bỏ dấu + viết thường: "to nhu a" vẫn tìm ra "Tô nhựa" */
  static norm(s: string): string {
    return (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
  }

  readonly pickerTotalPages = computed(() => Math.max(1, Math.ceil(this.pickerFiltered().length / this.pickerPageSize)));
  readonly pickerPaged = computed(() => {
    const start = (this.pickerPage() - 1) * this.pickerPageSize;
    return this.pickerFiltered().slice(start, start + this.pickerPageSize);
  });

  readonly subtotal = computed(() => this.items().reduce((s, i) => s + i.price * i.qty, 0));
  readonly discountAmount = computed(() => Math.round((this.subtotal() * (Number(this.discountPercent ?? 0))) / 100));
  readonly taxAmount = computed(() => Math.round((this.subtotal() * (Number(this.taxPercent ?? 0))) / 100));
  readonly totalDue = computed(() => this.subtotal() - this.discountAmount() + this.taxAmount());
  readonly changeDue = computed(() => Math.max(0, Number(this.customerPaid ?? 0) - this.totalDue()));
  readonly totalQty = computed(() => this.items().reduce((s, i) => s + i.qty, 0));

  constructor() {
    addIcons({
      arrowBackOutline,
      checkmarkOutline,
      addOutline,
      barcodeOutline,
      listOutline,
      qrCodeOutline,
      closeOutline,
      removeOutline,
      trashOutline,
      searchOutline,
      chevronBackOutline,
      chevronForwardOutline,
      receiptOutline,
      refreshOutline,
      personOutline,
      walletOutline,
      readerOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    this.orderCode = this.ordersService.newCode();
    this.hasPaymentMethodColumn = await this.ordersService.detectPaymentMethod().catch(() => false);
    this.loading.set(true);
    try {
      const [products, customers, accounts] = await Promise.all([
        this.productsService.list(),
        this.customersService.list(),
        this.moneyAccountsService.list(),
      ]);
      this.products.set(products);
      this.customers.set(customers);
      this.accounts.set(accounts);
      if (accounts.length) this.selectedAccountId = accounts[0].id;

      const shopId = this.auth.shop()?.id;
      if (shopId && this.sb.isConfigured) {
        const { data } = await this.sb.from('profiles').select('*').eq('shop_id', shopId);
        this.staff.set((data ?? []) as Profile[]);
      }

      // Nếu mở từ nút "Tạo đơn: quét mã" → tự thêm sản phẩm theo mã vạch
      const barcode = this.route.snapshot.queryParamMap.get('barcode');
      if (barcode) {
        const found = this.products().find((p) => (p.sku ?? '').toLowerCase() === barcode.toLowerCase());
        if (found) {
          this.addProduct(found);
          this.toast(`Đã thêm: ${found.name}`);
        } else {
          this.barcodeInput = barcode;
          this.toast(`Không tìm thấy sản phẩm mã "${barcode}"`, 'danger');
        }
      }
    } catch (e) {
      console.error('load sale data failed', e);
    } finally {
      this.loading.set(false);
    }
  }

  selectTab(tab: 'payment' | 'customer' | 'note' | 'shipping') {
    this.tab.set(tab);
  }

  resetCode() {
    this.orderCode = this.ordersService.newCode();
    this.toast('Đã tạo mã đơn mới');
  }

  /** Focus ô "Mã vạch" để dùng đầu đọc mã */
  focusBarcode(field: IonInput) {
    field?.setFocus?.();
  }

  /** Nút + nổi giữa đáy màn hình: cuộn tới khung chọn sản phẩm + focus ô tìm (như FAB của Isale) */
  @ViewChild('catalogCard') catalogCard?: ElementRef<HTMLElement>;
  @ViewChild('catalogSearch') catalogSearch?: IonInput;

  goToCatalog() {
    this.catalogCard?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      Promise.resolve(this.catalogSearch?.setFocus()).catch(() => {});
    }, 500);
  }

  /** Mở trang Báo giá để chọn sản phẩm từ báo giá (giống Isale) */
  openQuotes() {
    this.router.navigateByUrl('/quote');
  }

  /** Ảnh lỗi → ẩn để lộ icon dự phòng */
  hideImg(ev: Event) {
    const img = ev.target as HTMLImageElement;
    if (img) img.style.display = 'none';
  }

  nextPickerPage() {
    if (this.pickerPage() < this.pickerTotalPages()) this.pickerPage.update((p) => p + 1);
  }

  prevPickerPage() {
    if (this.pickerPage() > 1) this.pickerPage.update((p) => p - 1);
  }

  onPickerSearch(ev: CustomEvent) {
    this.pickerSearch.set((ev.detail as any)?.value ?? '');
    this.pickerPage.set(1);
  }

  addProduct(p: Product, qty: number = 1) {
    const current = [...this.items()];
    const existing = current.find((i) => i.product_id === p.id);
    if (existing) {
      existing.qty += qty;
    } else {
      current.push({ product_id: p.id, name: p.name, unit: p.unit, price: Number(p.price), qty });
    }
    this.items.set(current);
  }

  /** Nút + trên thẻ: thêm nhanh 1 sản phẩm */
  quickAdd(ev: Event, p: Product) {
    ev.stopPropagation();
    this.addProduct(p);
    this.toast(`Đã thêm: ${p.name}`);
  }

  addByBarcode() {
    const code = this.barcodeInput.trim();
    if (!code) return;
    const found = this.products().find((p) => (p.sku ?? '').toLowerCase() === code.toLowerCase());
    if (found) {
      this.addProduct(found);
      this.toast(`Đã thêm: ${found.name}`);
    } else {
      this.toast(`Không tìm thấy sản phẩm mã "${code}"`, 'danger');
    }
    this.barcodeInput = '';
  }

  incQty(index: number) {
    const current = [...this.items()];
    current[index].qty += 1;
    this.items.set(current);
  }

  decQty(index: number) {
    const current = [...this.items()];
    if (current[index].qty > 1) {
      current[index].qty -= 1;
    } else {
      current.splice(index, 1);
    }
    this.items.set(current);
  }

  removeItem(index: number) {
    const current = [...this.items()];
    current.splice(index, 1);
    this.items.set(current);
  }

  async selectCustomer() {
    const buttons = this.customers().slice(0, 30).map((c) => ({
      text: c.name + (c.phone ? ` — ${c.phone}` : ''),
      handler: () => {
        this.selectedCustomerId = c.id;
        this.selectedCustomerName = c.name;
      },
    }));
    const sheet = await this.actionSheetCtrl.create({
      header: 'Chọn khách hàng',
      buttons: [...buttons, { text: 'Khách lẻ', handler: () => { this.selectedCustomerId = null; this.selectedCustomerName = 'Khách lẻ'; } }, { text: 'Hủy', role: 'cancel' }],
    });
    await sheet.present();
  }

  async selectStaff() {
    const buttons = this.staff().map((s) => ({
      text: s.full_name ?? 'Nhân viên',
      handler: () => {
        this.selectedStaffId = s.id;
      },
    }));
    const sheet = await this.actionSheetCtrl.create({
      header: 'Chọn NV/CTV',
      buttons: [...buttons, { text: 'Hủy', role: 'cancel' }],
    });
    await sheet.present();
  }

  async selectAccount() {
    const buttons = this.accounts().map((a) => ({
      text: a.name,
      handler: () => {
        this.selectedAccountId = a.id;
      },
    }));
    const sheet = await this.actionSheetCtrl.create({
      header: 'Chọn ví/tài khoản',
      buttons: [...buttons, { text: 'Hủy', role: 'cancel' }],
    });
    await sheet.present();
  }

  staffName(): string {
    return this.staff().find((s) => s.id === this.selectedStaffId)?.full_name ?? 'Chọn NV/CTV';
  }

  accountName(): string {
    return this.accounts().find((a) => a.id === this.selectedAccountId)?.name ?? 'Chọn ví/tài khoản';
  }

  async showQr() {
    const t = await this.toastCtrl.create({
      message: 'QR thanh toán sẽ hiển thị khi cấu hình thông tin ngân hàng trong Cấu hình shop.',
      duration: 2200,
      color: 'medium',
      position: 'bottom',
    });
    await t.present();
  }

  async save() {
    if (!this.items().length) {
      this.toast('Chưa có sản phẩm nào trong đơn', 'danger');
      return;
    }
    this.busy.set(true);
    try {
      const order = await this.ordersService.create(
        {
          code: this.orderCode,
          customer_id: this.selectedCustomerId,
          customer_name: this.selectedCustomerName || 'Khách lẻ',
          status: this.status,
          discount: this.discountAmount(),
          paid: true,
          note: this.note.trim() || null,
          ...(this.hasPaymentMethodColumn ? { payment_method: this.paymentMethod } : {}),
        },
        this.items().map((i) => ({ product_id: i.product_id, name: i.name, price: i.price, qty: i.qty }))
      );

      // Ghi nhận thu tiền vào sổ
      if (this.totalDue() > 0) {
        await this.transactionsService.create({
          type: 'income',
          category: 'Bán hàng',
          amount: this.totalDue(),
          note: `Thu tiền đơn ${order.code}`,
          occurred_at: new Date().toISOString(),
        });
      }

      this.toast('Đã lưu đơn ' + order.code);
      this.router.navigateByUrl('/order', { replaceUrl: true });
    } catch (e: any) {
      this.toast(e?.message ?? 'Lưu đơn thất bại', 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  goBack() {
    this.router.navigateByUrl('/home');
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

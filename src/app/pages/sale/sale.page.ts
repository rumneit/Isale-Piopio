import { Component, HostListener, OnInit, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
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
  IonTextarea,
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
  walletOutline,
  readerOutline,
  warningOutline,
} from 'ionicons/icons';
import { ProductsService } from '../../core/services/products.service';
import { OrdersService } from '../../core/services/orders.service';
import { CustomersService } from '../../core/services/customers.service';
import { AuthService } from '../../core/services/auth.service';
import { Product, Customer, MoneyAccount, Shop } from '../../core/models/models';
import { MoneyAccountsService } from '../../core/services/money-accounts.service';
import { SettingsService } from '../../core/services/settings.service';

interface SaleItem {
  product_id: string | null;
  name: string;
  unit: string | null;
  price: number;
  qty: number;
}

/** Trạng thái đầy đủ của 1 đơn trong lượt bán (đồng bộ ISale multi-add) */
interface SaleOrderSnap {
  orderCode: string;
  orderDate: string;
  selectedCustomerId: string | null;
  selectedCustomerName: string;
  selectedAccountId: string | null;
  status: string;
  paymentMethod: string;
  customerShipPaid: boolean;
  discountPercent: number | null;
  taxPercent: number | null;
  customerPaid: number | null;
  shipFee: number | null;
  customerPhone: string;
  customerAddress: string;
  note: string;
  shippingCode: string;
  shippingPartner: string;
  shipperName: string;
  shipperPhone: string;
  shippingAddress: string;
  items: SaleItem[];
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
    IonTextarea,
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
  @HostListener('document:keydown.escape')
  closeQrOnEscape(): void {
    if (this.qrOpen()) this.closeQr();
  }
  openHome() {
    this.router.navigateByUrl('/home');
  }

  private productsService = inject(ProductsService);
  private ordersService = inject(OrdersService);
  private customersService = inject(CustomersService);
  private moneyAccountsService = inject(MoneyAccountsService);
  private settingsService = inject(SettingsService);
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
  readonly items = signal<SaleItem[]>([]);
  readonly allowNegativeStock = signal(false);

  // Tab chính
  readonly tab = signal<'payment' | 'customer' | 'note' | 'shipping'>('payment');
  // Danh sách sản phẩm (hiển thị sẵn) + phân trang
  readonly pickerPage = signal(1);
  readonly pickerSearch = signal('');
  readonly pickerPageSize = 12;

  // Nhiều đơn song song (ISale multi-add): danh sách + vị trí đang mở
  readonly orderTabs = signal<SaleOrderSnap[]>([]);
  readonly activeOrderIdx = signal(0);

  // Thông tin đơn
  orderCode = '';
  orderDate = new Date().toISOString();
  selectedCustomerId: string | null = null;
  selectedCustomerName = '';
  selectedAccountId: string | null = null;
  status = 'completed';
  customerShipPaid = false;
  discountPercent: number | null = 0;
  taxPercent: number | null = 0;
  customerPaid: number | null = 0;
  /** Phí vận chuyển — cộng vào Tổng phải trả khi "Khách trả ship?" bật */
  shipFee: number | null = 0;
  /** Hình thức thanh toán (ISale, 10 hình thức) — lưu mã CASH/BANK-TRANSFER/... khi cột payment_method có (v17) */
  paymentMethod = 'CASH';
  hasPaymentMethodColumn = false;
  readonly payMethods = OrdersService.paymentMethods;
  readonly orderStatusList = OrdersService.orderStatuses;
  /** Khách hàng: SĐT + địa chỉ nhanh trên đơn (v22) */
  customerPhone = '';
  customerAddress = '';
  /** Vận chuyển (ISale: 5 trường, v22) */
  shippingCode = '';
  shippingPartner = '';
  shipperName = '';
  shipperPhone = '';
  shippingAddress = '';
  /** Cột v22 hiện có trong DB (dò lúc mở trang) */
  readonly hasOrderExtras = signal<Set<string>>(new Set());
  note = '';
  barcodeInput = '';
  /** Overlay QR VietQR thanh toán */
  readonly qrOpen = signal(false);
  /** Shop hiện tại (cho QR ngân hàng) */
  readonly shop = this.auth.shop;

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
  /** Tổng tạm tính = tiền hàng − chiết khấu + thuế */
  readonly preTotal = computed(() => this.subtotal() - this.discountAmount() + this.taxAmount());
  /** Tổng phải trả = tạm tính + phí ship (nếu khách trả ship) */
  readonly totalDue = computed(() => this.preTotal() + (this.customerShipPaid ? Math.max(0, Number(this.shipFee ?? 0)) : 0));
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
      walletOutline,
      readerOutline,
      warningOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    this.orderCode = this.ordersService.newCode();
    this.hasPaymentMethodColumn = await this.ordersService.detectPaymentMethod().catch(() => false);
    this.orderTabs.set([this.currentSnap()]);
    this.loading.set(true);
    try {
      const [products, customers, accounts] = await Promise.all([
        this.productsService.list(),
        this.customersService.list(),
        this.moneyAccountsService.list(),
        this.settingsService.load(),
      ]);
      this.allowNegativeStock.set(this.settingsService.booleanValue('allow_negative_stock'));
      this.products.set(products);
      this.customers.set(customers);
      this.accounts.set(accounts);
      if (accounts.length) this.selectedAccountId = accounts[0].id;
      this.ordersService
        .detectOrderExtras()
        .then((cols) => this.hasOrderExtras.set(cols))
        .catch(() => {});

      // Nếu mở từ nút "Tạo đơn: quét mã" → tự thêm sản phẩm theo mã vạch
      const barcode = this.route.snapshot.queryParamMap.get('barcode');
      if (barcode) {
        const found = this.products().find((p) => (p.sku ?? '').toLowerCase() === barcode.toLowerCase());
        if (found) {
          if (this.addProduct(found)) this.toast(`Đã thêm: ${found.name}`);
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

  // ---------- Nhiều đơn song song (ISale multi-add) ----------

  /** Chốt trạng thái hiện tại thành 1 snapshot */
  private currentSnap(): SaleOrderSnap {
    return {
      orderCode: this.orderCode,
      orderDate: this.orderDate,
      selectedCustomerId: this.selectedCustomerId,
      selectedCustomerName: this.selectedCustomerName,
      selectedAccountId: this.selectedAccountId,
      status: this.status,
      paymentMethod: this.paymentMethod,
      customerShipPaid: this.customerShipPaid,
      discountPercent: this.discountPercent,
      taxPercent: this.taxPercent,
      customerPaid: this.customerPaid,
      shipFee: this.shipFee,
      customerPhone: this.customerPhone,
      customerAddress: this.customerAddress,
      note: this.note,
      shippingCode: this.shippingCode,
      shippingPartner: this.shippingPartner,
      shipperName: this.shipperName,
      shipperPhone: this.shipperPhone,
      shippingAddress: this.shippingAddress,
      items: [...this.items()],
    };
  }

  /** Nạp snapshot vào các trường đang mở */
  private applySnap(s: SaleOrderSnap) {
    this.orderCode = s.orderCode;
    this.orderDate = s.orderDate;
    this.selectedCustomerId = s.selectedCustomerId;
    this.selectedCustomerName = s.selectedCustomerName;
    this.selectedAccountId = s.selectedAccountId;
    this.status = s.status;
    this.paymentMethod = s.paymentMethod;
    this.customerShipPaid = s.customerShipPaid;
    this.discountPercent = s.discountPercent;
    this.taxPercent = s.taxPercent;
    this.customerPaid = s.customerPaid;
    this.shipFee = s.shipFee;
    this.customerPhone = s.customerPhone;
    this.customerAddress = s.customerAddress;
    this.note = s.note;
    this.shippingCode = s.shippingCode;
    this.shippingPartner = s.shippingPartner;
    this.shipperName = s.shipperName;
    this.shipperPhone = s.shipperPhone;
    this.shippingAddress = s.shippingAddress;
    this.items.set([...s.items]);
  }

  switchOrderTab(i: number) {
    if (i === this.activeOrderIdx() || i < 0 || i >= this.orderTabs().length) return;
    // Lưu đơn đang mở rồi nạp đơn được chọn
    this.orderTabs.update((list) => list.map((s, idx) => (idx === this.activeOrderIdx() ? this.currentSnap() : s)));
    this.activeOrderIdx.set(i);
    this.applySnap(this.orderTabs()[i]);
  }

  addOrderTab() {
    if (this.orderTabs().length >= 10) {
      this.toast('Tối đa 10 đơn mỗi lượt bán', 'danger');
      return;
    }
    this.orderTabs.update((list) => list.map((s, idx) => (idx === this.activeOrderIdx() ? this.currentSnap() : s)));
    const fresh: SaleOrderSnap = {
      ...this.currentSnap(),
      orderCode: this.ordersService.newCode(),
      selectedCustomerId: null,
      selectedCustomerName: '',
      customerPhone: '',
      customerAddress: '',
      note: '',
      shippingCode: '',
      shippingPartner: '',
      shipperName: '',
      shipperPhone: '',
      shippingAddress: '',
      items: [],
      customerPaid: 0,
      discountPercent: 0,
      taxPercent: 0,
      shipFee: 0,
    };
    this.orderTabs.update((list) => [...list, fresh]);
    this.activeOrderIdx.set(this.orderTabs().length - 1);
    this.applySnap(fresh);
    this.toast(`Đã thêm Đơn hàng ${this.orderTabs().length}`);
  }

  removeOrderTab(i: number) {
    if (this.orderTabs().length <= 1) return;
    const active = this.activeOrderIdx();
    if (i === active) {
      // Xóa đơn đang mở → mở đơn kề sau (hoặc trước nếu đang ở cuối)
      this.orderTabs.update((list) => list.filter((_, idx) => idx !== i));
      const next = Math.min(i, this.orderTabs().length - 1);
      this.activeOrderIdx.set(next);
      this.applySnap(this.orderTabs()[next]);
    } else {
      this.orderTabs.update((list) => list.filter((_, idx) => idx !== i));
      if (i < active) this.activeOrderIdx.set(active - 1);
    }
    this.toast('Đã xóa đơn');
  }

  /** Tổng phải trả của 1 snapshot (khi lưu cả lượt) */
  private dueOf(s: SaleOrderSnap): number {
    const goods = s.items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const disc = Math.round((goods * Number(s.discountPercent ?? 0)) / 100);
    const tax = Math.round((goods * Number(s.taxPercent ?? 0)) / 100);
    return goods - disc + tax + (s.customerShipPaid ? Math.max(0, Number(s.shipFee ?? 0)) : 0);
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

  addProduct(p: Product, qty: number = 1): boolean {
    const current = [...this.items()];
    const existing = current.find((i) => i.product_id === p.id);
    const nextQty = (existing?.qty ?? 0) + qty;
    if (!this.allowNegativeStock() && nextQty > Number(p.stock ?? 0)) {
      this.toast(`Không đủ tồn kho cho "${p.name}". Còn ${p.stock}, cần ${nextQty}.`, 'danger');
      return false;
    }
    if (existing) {
      existing.qty += qty;
    } else {
      current.push({ product_id: p.id, name: p.name, unit: p.unit, price: Number(p.price), qty });
    }
    this.items.set(current);
    return true;
  }

  /** Nút + trên thẻ: thêm nhanh 1 sản phẩm */
  quickAdd(ev: Event, p: Product) {
    ev.stopPropagation();
    if (this.addProduct(p)) this.toast(`Đã thêm: ${p.name}`);
  }

  addByBarcode() {
    const code = this.barcodeInput.trim();
    if (!code) return;
    const found = this.products().find((p) => (p.sku ?? '').toLowerCase() === code.toLowerCase());
    if (found) {
      if (this.addProduct(found)) this.toast(`Đã thêm: ${found.name}`);
    } else {
      this.toast(`Không tìm thấy sản phẩm mã "${code}"`, 'danger');
    }
    this.barcodeInput = '';
  }

  incQty(index: number) {
    const current = [...this.items()];
    const item = current[index];
    const product = this.products().find((p) => p.id === item.product_id);
    if (product && !this.allowNegativeStock() && item.qty + 1 > Number(product.stock ?? 0)) {
      this.toast(`Không đủ tồn kho cho "${item.name}". Còn ${product.stock}.`, 'danger');
      return;
    }
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
        // Điền nhanh SĐT/địa chỉ (ISale: chọn KH có sẵn)
        this.customerPhone = c.phone ?? '';
        this.customerAddress = c.address ?? '';
      },
    }));
    const sheet = await this.actionSheetCtrl.create({
      header: 'Chọn khách hàng có sẵn',
      buttons: [...buttons, { text: 'Khách lẻ', handler: () => { this.selectedCustomerId = null; this.selectedCustomerName = 'Khách lẻ'; this.customerPhone = ''; this.customerAddress = ''; } }, { text: 'Hủy', role: 'cancel' }],
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

  accountName(): string {
    return this.accounts().find((a) => a.id === this.selectedAccountId)?.name ?? 'Chọn ví/tài khoản';
  }

  /** QR VietQR từ thông tin ngân hàng shop (Cấu hình) — như "Hiện QR Code thanh toán" của ISale */
  readonly qrUrl = computed(() => {
    if (!this.qrOpen()) return '';
    const shop = this.auth.shop() as (Shop & { bank_code?: string | null }) | null;
    const bank = (shop?.bank_code ?? '').trim();
    const acc = (shop?.bank_account ?? '').trim();
    if (!bank || !acc) return '';
    const amount = Math.max(0, this.totalDue());
    const info = encodeURIComponent(this.orderCode || 'Thanh toan');
    const owner = encodeURIComponent((shop?.bank_owner ?? '').trim());
    return (
      `https://img.vietqr.io/image/${bank}-${acc}-compact2.png` +
      `?amount=${amount}&addInfo=${info}` +
      (owner ? `&accountName=${owner}` : '')
    );
  });

  closeQr() {
    this.qrOpen.set(false);
  }

  async showQr() {
    const shop = this.auth.shop() as (Shop & { bank_code?: string | null }) | null;
    if (!(shop?.bank_code ?? '').trim() || !(shop?.bank_account ?? '').trim()) {
      const t = await this.toastCtrl.create({
        message: 'Chưa có thông tin ngân hàng. Vào Cấu hình → Thông tin ngân hàng để bật QR thanh toán.',
        duration: 2600,
        color: 'medium',
        position: 'bottom',
      });
      await t.present();
      return;
    }
    this.qrOpen.set(true);
  }

  async save() {
    // Lưu CẢ LƯỢT bán (tất cả tab Đơn hàng) như ISale multi-add
    this.orderTabs.update((list) => list.map((s, idx) => (idx === this.activeOrderIdx() ? this.currentSnap() : s)));
    const batch = this.orderTabs();
    const withItems = batch.filter((s) => s.items.length > 0);
    if (!withItems.length) {
      this.toast('Chưa có sản phẩm nào trong đơn', 'danger');
      return;
    }
    if (!this.allowNegativeStock()) {
      const requested = new Map<string, { name: string; qty: number }>();
      for (const order of withItems.filter((s) => !['draft', 'quote', 'cancelled'].includes(s.status))) {
        for (const item of order.items) {
          if (!item.product_id) continue;
          const current = requested.get(item.product_id) ?? { name: item.name, qty: 0 };
          current.qty += item.qty;
          requested.set(item.product_id, current);
        }
      }
      for (const [productId, request] of requested) {
        const stock = Number(this.products().find((p) => p.id === productId)?.stock ?? 0);
        if (request.qty > stock) {
          this.toast(`Không đủ tồn kho cho "${request.name}". Còn ${stock}, cần ${request.qty}.`, 'danger');
          return;
        }
      }
    }
    const empties = batch.length - withItems.length;
    this.busy.set(true);
    try {
      const extras = this.hasOrderExtras();
      let saved = 0;
      for (const s of withItems) {
        await this.ordersService.create(
          {
            code: s.orderCode || this.ordersService.newCode(),
            customer_id: s.selectedCustomerId,
            customer_name: s.selectedCustomerName || 'Khách lẻ',
            status: s.status,
            discount: Math.round((s.items.reduce((sum, i) => sum + i.price * i.qty, 0) * Number(s.discountPercent ?? 0)) / 100),
            paid: true,
            note: [s.note.trim(), s.shippingCode.trim() ? `Vận đơn: ${s.shippingCode.trim()}` : '', s.shippingPartner.trim() ? `ĐVVC: ${s.shippingPartner.trim()}` : '']
              .filter(Boolean)
              .join(' — ') || null,
            total: this.dueOf(s),
            ...(this.hasPaymentMethodColumn ? { payment_method: s.paymentMethod } : {}),
            ...(extras.has('ship_fee') ? { ship_fee: Math.max(0, Number(s.shipFee ?? 0)) } : {}),
            ...(extras.has('ship_fee_by_customer') ? { ship_fee_by_customer: !!s.customerShipPaid } : {}),
            ...(extras.has('customer_phone') ? { customer_phone: s.customerPhone.trim() || null } : {}),
            ...(extras.has('customer_address') ? { customer_address: s.customerAddress.trim() || null } : {}),
            ...(extras.has('shipping_code') ? { shipping_code: s.shippingCode.trim() || null } : {}),
            ...(extras.has('shipping_partner') ? { shipping_partner: s.shippingPartner.trim() || null } : {}),
            ...(extras.has('shipper_name') ? { shipper_name: s.shipperName.trim() || null } : {}),
            ...(extras.has('shipper_phone') ? { shipper_phone: s.shipperPhone.trim() || null } : {}),
            ...(extras.has('shipping_address') ? { shipping_address: s.shippingAddress.trim() || null } : {}),
          },
          s.items.map((i) => ({ product_id: i.product_id, name: i.name, price: i.price, qty: i.qty })),
          { recordIncome: this.dueOf(s) > 0 }
        );
        saved++;
      }

      this.toast(`Đã lưu ${saved} đơn` + (empties ? ` (bỏ qua ${empties} đơn trống)` : ''));
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

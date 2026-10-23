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
  ModalController,
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
  chevronDownOutline,
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
import { Product, Customer, MoneyAccount, Order, OrderItem, Shop } from '../../core/models/models';
import { MoneyAccountsService } from '../../core/services/money-accounts.service';
import { SettingsService } from '../../core/services/settings.service';
import { CustomerPickerModalComponent } from '../customers/customer-picker.modal';
import {
  SaleUnit,
  basePriceFor,
  baseQtyFor,
  defaultSaleUnit,
  findSaleUnit,
  productSaleUnits,
} from '../../core/utils/product-units';

interface SaleItem {
  /** id dòng order_items khi đang sửa đơn đã tạo; undefined với dòng mới */
  id?: string;
  product_id: string | null;
  name: string;
  /** Đơn vị khách chọn (Cái/Thùng/Lốc...) */
  unit: string | null;
  /** Giá bán theo đơn vị đang chọn — hiển thị và tính tiền trên màn hình */
  price: number;
  /** Giá niêm yết của đơn vị đang chọn — dùng để hoàn tác khi sửa giá */
  listPrice?: number;
  /** Số lượng theo đơn vị đang chọn — hiển thị cho người bán */
  qty: number;
  /** 1 đơn vị đang chọn = bao nhiêu đơn vị gốc */
  unitConversion: number;
  /** Số lượng quy về đơn vị gốc — gửi RPC/kiểm tra tồn kho */
  baseQty: number;
  /** Giá quy về đơn vị gốc — gửi RPC */
  basePrice: number;
}

/** Trạng thái đầy đủ của 1 đơn trong lượt bán (đồng bộ ISale multi-add) */
interface SaleOrderSnap {
  /** Khóa chống gửi lặp ổn định cho đơn này (giữ nguyên khi lưu lỗi và thử lại). */
  nonce: string;
  orderCode: string;
  orderDate: string;
  selectedCustomerId: string | null;
  selectedCustomerName: string;
  /** Công nợ hiện tại của khách đã chọn (hiện ngay trên đơn) */
  selectedCustomerDebt: number;
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
  private modalCtrl = inject(ModalController);
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
  /**
   * Nonce của đơn đang mở. Phải ổn định qua các lần chuyển tab và các lần thử
   * lưu lại: nếu sinh mới mỗi request thì lần thử lại sau lỗi mạng sẽ tạo đơn
   * trùng và trừ tồn/ghi thu hai lần.
   */
  private activeNonce: string = crypto.randomUUID();

  /** Đang sửa một đơn đã tạo (mở từ nút bút chì ở chi tiết đơn hàng) */
  readonly editingOrderId = signal<string | null>(null);
  readonly editingOrder = signal<Order | null>(null);
  /**
   * Số lượng từng sản phẩm trong đơn gốc. Tồn kho hiện tại đã bị trừ số lượng
   * này, nên khi sửa chỉ phần tăng thêm mới cần kiểm tra tồn.
   */
  private readonly originalQtyByProduct = new Map<string, number>();

  // Thông tin đơn
  orderCode = '';
  orderDate = new Date().toISOString();
  selectedCustomerId: string | null = null;
  selectedCustomerName = '';
  /** Nợ của khách đã chọn — hiện ngay khi chọn khách có sẵn */
  selectedCustomerDebt = 0;
  selectedAccountId: string | null = null;
  status = 'completed';
  /**
   * Khách trả phí ship? Mặc định BẬT để phí ship nhập vào được cộng luôn vào tổng
   * (trước đây mặc định tắt nên bill có phí ship mà tổng không cộng).
   */
  customerShipPaid = true;
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
  /**
   * Các giá trị dưới đây cố tình dùng hàm thường (không phải computed) vì chúng
   * đọc các biến nhập tay discountPercent/taxPercent/shipFee/customerShipPaid/customerPaid.
   * computed() chỉ theo dõi signal nên trước đây Tổng phải trả bị "đứng" khi gõ phí ship/chiết khấu/VAT.
   */
  readonly discountAmount = () => Math.round((this.subtotal() * Number(this.discountPercent ?? 0)) / 100);
  readonly taxAmount = () => Math.round((this.subtotal() * Number(this.taxPercent ?? 0)) / 100);
  /** Tổng tạm tính = tiền hàng − chiết khấu (chưa gồm thuế và phí ship) */
  readonly preTotal = () => this.subtotal() - this.discountAmount();
  /** Tổng phải trả = tạm tính + thuế VAT + phí ship (nếu khách trả ship) */
  readonly totalDue = () =>
    this.preTotal() + this.taxAmount() + (this.customerShipPaid ? Math.max(0, Number(this.shipFee ?? 0)) : 0);
  readonly changeDue = () => Math.max(0, Number(this.customerPaid ?? 0) - this.totalDue());
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
      chevronDownOutline,
      receiptOutline,
      refreshOutline,
      walletOutline,
      readerOutline,
      warningOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    const editId = this.route.snapshot.queryParamMap.get('edit');
    if (editId) this.editingOrderId.set(editId);
    this.orderCode = this.ordersService.newCode();
    this.orderDate = this.toLocalInput(new Date().toISOString());
    this.hasPaymentMethodColumn = await this.ordersService.detectPaymentMethod().catch(() => false);
    if (!editId) this.orderTabs.set([this.currentSnap()]);
    this.loading.set(true);
    try {
      const [products, customers, accounts, , editData] = await Promise.all([
        this.productsService.list(),
        this.customersService.list(),
        this.moneyAccountsService.list(),
        this.settingsService.load(),
        editId ? this.ordersService.getWithItems(editId) : Promise.resolve(null),
      ]);
      this.allowNegativeStock.set(this.settingsService.booleanValue('allow_negative_stock'));
      this.products.set(products);
      this.customers.set(customers);
      this.accounts.set(accounts);
      const defaultAccount = accounts.find((a) => a.is_default) ?? accounts[0];
      if (defaultAccount) this.selectedAccountId = defaultAccount.id;
      this.ordersService
        .detectOrderExtras()
        .then((cols) => this.hasOrderExtras.set(cols))
        .catch(() => {});

      if (editId) {
        if (!editData?.order) {
          await this.toast('Không tìm thấy đơn hàng cần sửa', 'danger');
          this.router.navigateByUrl('/order', { replaceUrl: true });
          return;
        }
        this.applyOrderToSale(editData.order, editData.items);
      } else {
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
      }

      this.orderTabs.set([this.currentSnap()]);
    } catch (e) {
      console.error('load sale data failed', e);
      if (editId) {
        await this.toast('Không tải được đơn hàng để sửa', 'danger');
        this.router.navigateByUrl('/order', { replaceUrl: true });
      }
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
      nonce: this.activeNonce,
      orderCode: this.orderCode,
      orderDate: this.orderDate,
      selectedCustomerId: this.selectedCustomerId,
      selectedCustomerName: this.selectedCustomerName,
      selectedCustomerDebt: this.selectedCustomerDebt,
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
    this.activeNonce = s.nonce || crypto.randomUUID();
    this.orderCode = s.orderCode;
    this.orderDate = s.orderDate;
    this.selectedCustomerId = s.selectedCustomerId;
    this.selectedCustomerName = s.selectedCustomerName;
    this.selectedCustomerDebt = s.selectedCustomerDebt ?? 0;
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

  /** Nạp một đơn đã tạo vào màn hình bán hàng để sửa toàn bộ. */
  private applyOrderToSale(order: Order, orderItems: OrderItem[]): void {
    const merchandise = orderItems.reduce(
      (sum, item) => sum + Number(item.price ?? 0) * Number(item.qty ?? 0),
      0
    );
    const discount = Math.max(0, Number(order.discount ?? 0));
    const ship = Math.max(0, Number(order.ship_fee ?? 0));
    const shippingIncluded = order.ship_fee_by_customer === false ? 0 : ship;
    const tax = Math.max(
      0,
      Math.round(Number(order.total ?? 0) - merchandise + discount - shippingIncluded)
    );
    const customer = order.customer_id
      ? this.customers().find((c) => c.id === order.customer_id)
      : null;

    this.editingOrder.set(order);
    this.orderCode = order.code;
    this.orderDate = this.toLocalInput(order.created_at);
    if (order.account_id) this.selectedAccountId = order.account_id;
    this.selectedCustomerId = order.customer_id ?? null;
    this.selectedCustomerName = order.customer_name ?? 'Khách lẻ';
    this.selectedCustomerDebt = Number(customer?.debt ?? 0);
    this.status = order.status || 'completed';
    this.paymentMethod = order.payment_method || 'CASH';
    this.customerShipPaid = order.ship_fee_by_customer !== false;
    this.discountPercent = merchandise > 0 ? this.roundPercent((discount / merchandise) * 100) : 0;
    this.taxPercent = merchandise > 0 ? this.roundPercent((tax / merchandise) * 100) : 0;
    this.customerPaid = order.paid ? Number(order.total ?? 0) : 0;
    this.shipFee = ship;
    this.customerPhone = order.customer_phone ?? '';
    this.customerAddress = order.customer_address ?? '';
    this.note = order.note ?? '';
    this.shippingCode = order.shipping_code ?? '';
    this.shippingPartner = order.shipping_partner ?? '';
    this.shipperName = order.shipper_name ?? '';
    this.shipperPhone = order.shipper_phone ?? '';
    this.shippingAddress = order.shipping_address ?? '';

    // Chỉ đơn đang tính tồn mới đã trừ sẵn số lượng gốc khỏi kho.
    // Đơn nháp/báo giá/đã hủy chưa trừ tồn nên không được cộng lại phần gốc.
    const originalCountsStock = !['draft', 'quote', 'cancelled'].includes(order.status || 'completed');
    this.originalQtyByProduct.clear();
    this.items.set(
      orderItems.map((item) => {
        const product = this.products().find((p) => p.id === item.product_id);
        if (item.product_id && originalCountsStock) {
          this.originalQtyByProduct.set(
            item.product_id,
            (this.originalQtyByProduct.get(item.product_id) ?? 0) + Number(item.qty ?? 0)
          );
        }
        // Đơn cũ chưa có metadata đơn vị → coi như đang bán theo đơn vị gốc.
        const conversion = Number(item.unit_conversion) > 0 ? Number(item.unit_conversion) : 1;
        const unitQty = item.unit_qty != null ? Number(item.unit_qty) : Number(item.qty ?? 0);
        const unitPrice = item.unit_price != null ? Number(item.unit_price) : Number(item.price ?? 0);
        const unitName = item.unit ?? product?.unit ?? null;
        return {
          id: item.id,
          product_id: item.product_id,
          name: item.name,
          unit: unitName,
          price: unitPrice,
          listPrice: findSaleUnit(product, unitName)?.price ?? unitPrice,
          qty: unitQty,
          unitConversion: conversion,
          baseQty: Number(item.qty ?? 0),
          basePrice: Number(item.price ?? 0),
        };
      })
    );
  }

  /** datetime-local cần chuỗi giờ địa phương YYYY-MM-DDTHH:mm, không phải ISO UTC. */
  private toLocalInput(iso: string | null | undefined): string {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  private fromLocalInput(value: string): string | null {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  private roundPercent(value: number): number {
    // Giữ đủ chính xác để tổng tiền của đơn cũ không bị lệch khi chỉ sửa tên/giá.
    return Math.round(value * 10000) / 10000;
  }

  switchOrderTab(i: number) {
    if (this.editingOrderId()) return;
    if (i === this.activeOrderIdx() || i < 0 || i >= this.orderTabs().length) return;
    // Lưu đơn đang mở rồi nạp đơn được chọn
    this.orderTabs.update((list) => list.map((s, idx) => (idx === this.activeOrderIdx() ? this.currentSnap() : s)));
    this.activeOrderIdx.set(i);
    this.applySnap(this.orderTabs()[i]);
  }

  addOrderTab() {
    if (this.editingOrderId()) return;
    if (this.orderTabs().length >= 10) {
      this.toast('Tối đa 10 đơn mỗi lượt bán', 'danger');
      return;
    }
    this.orderTabs.update((list) => list.map((s, idx) => (idx === this.activeOrderIdx() ? this.currentSnap() : s)));
    const fresh: SaleOrderSnap = {
      ...this.currentSnap(),
      nonce: crypto.randomUUID(),
      orderCode: this.ordersService.newCode(),
      selectedCustomerId: null,
      selectedCustomerName: '',
      selectedCustomerDebt: 0,
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
    if (this.editingOrderId()) return;
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

  /** Các đơn vị bán của sản phẩm (luôn có đơn vị gốc ở đầu). */
  productUnits(p: Product | null | undefined): SaleUnit[] {
    return productSaleUnits(p);
  }

  /** Dòng này có từ 2 đơn vị trở lên để đổi đơn vị tại chỗ không? */
  hasAlternateUnits(item: SaleItem): boolean {
    const product = this.products().find((p) => p.id === item.product_id);
    return this.productUnits(product).length > 1;
  }

  /**
   * Thêm sản phẩm với đơn vị cụ thể. `qty` là số lượng theo đơn vị đó;
   * tồn kho luôn được kiểm tra theo số lượng quy về đơn vị gốc.
   */
  addProduct(p: Product, qty: number = 1, unit?: SaleUnit | null): boolean {
    const chosen = unit ?? defaultSaleUnit(p);
    if (!chosen) return false;
    const conversion = chosen.conversion > 0 ? chosen.conversion : 1;
    const baseToAdd = baseQtyFor(qty, conversion);
    const current = [...this.items()];
    const existing = current.find((i) => i.product_id === p.id && i.unit === chosen.name);
    if (!this.allowNegativeStock() && this.stockTrackedStatus()) {
      const nextTotal = this.currentQtyForProduct(p.id) + baseToAdd;
      const original = this.originalQtyByProduct.get(p.id) ?? 0;
      const needed = Math.max(0, nextTotal - original);
      if (needed > Number(p.stock ?? 0)) {
        this.toast(
          `Không đủ tồn kho cho "${p.name}". Còn ${p.stock}, cần thêm ${this.formatNum(baseToAdd)}.`,
          'danger'
        );
        return false;
      }
    }
    if (existing) {
      existing.qty += qty;
      existing.baseQty = baseQtyFor(existing.qty, existing.unitConversion);
    } else {
      current.push({
        product_id: p.id,
        name: p.name,
        unit: chosen.name,
        price: chosen.price,
        listPrice: chosen.price,
        qty,
        unitConversion: conversion,
        baseQty: baseToAdd,
        basePrice: basePriceFor(chosen.price, conversion),
      });
    }
    this.items.set(current);
    return true;
  }

  /** Chặn mở 2 action sheet đơn vị khi bấm đúp thẻ/nhãn đơn vị. */
  private unitPickerOpen = false;

  /** Bấm vào thẻ sản phẩm: nếu có nhiều đơn vị thì hỏi chọn đơn vị trước. */
  async addProductFromTile(p: Product): Promise<void> {
    const units = this.productUnits(p);
    if (units.length <= 1) {
      if (this.addProduct(p)) this.toast(`Đã thêm: ${p.name}`);
      return;
    }
    if (this.unitPickerOpen) return;
    this.unitPickerOpen = true;
    try {
      const chosen = await this.pickUnit(p);
      if (!chosen) return;
      if (this.addProduct(p, 1, chosen)) this.toast(`Đã thêm: ${p.name} (${chosen.name})`);
    } finally {
      this.unitPickerOpen = false;
    }
  }

  /** ActionSheet chọn đơn vị — giống danh sách "Đơn vị" khi thêm sản phẩm của ISale. */
  private pickUnit(p: Product, currentName?: string | null): Promise<SaleUnit | null> {
    return new Promise<SaleUnit | null>(async (resolve) => {
      const baseName = (p.unit || 'Cái').trim() || 'Cái';
      const buttons = this.productUnits(p).map((u) => ({
        text:
          `${currentName === u.name ? '✓ ' : ''}${u.name} · ${this.formatMoney(u.price)}` +
          (u.conversion > 1 ? ` (1 ${u.name} = ${this.formatNum(u.conversion)} ${baseName})` : ''),
        cssClass: currentName === u.name ? 'sale-unit-selected' : undefined,
        handler: () => resolve(u),
      }));
      const sheet = await this.actionSheetCtrl.create({
        header: `Chọn đơn vị — ${p.name}`,
        subHeader: 'Giá và tồn kho sẽ tính theo đơn vị đã chọn',
        buttons: [...buttons, { text: 'Hủy', role: 'cancel', handler: () => resolve(null) }],
      });
      sheet.onDidDismiss().then(() => resolve(null));
      await sheet.present();
    });
  }

  /** Đổi đơn vị của một dòng đã có trong đơn (giữ nguyên số lượng hiển thị). */
  async changeItemUnit(index: number): Promise<void> {
    const item = this.items()[index];
    const product = this.products().find((p) => p.id === item?.product_id);
    if (!item || !product) return;
    if (this.productUnits(product).length <= 1) return;
    if (this.unitPickerOpen) return;
    this.unitPickerOpen = true;
    let chosen: SaleUnit | null = null;
    try {
      chosen = await this.pickUnit(product, item.unit);
    } finally {
      this.unitPickerOpen = false;
    }
    if (!chosen || chosen.name === item.unit) return;

    const oldBaseQty = this.itemBaseQty(item);
    const newBaseQty = baseQtyFor(item.qty, chosen.conversion);
    if (!this.allowNegativeStock() && this.stockTrackedStatus()) {
      const otherBase = this.currentQtyForProduct(product.id) - oldBaseQty;
      const original = this.originalQtyByProduct.get(product.id) ?? 0;
      const needed = Math.max(0, otherBase + newBaseQty - original);
      if (needed > Number(product.stock ?? 0)) {
        this.toast(`Không đủ tồn kho cho "${product.name}" theo đơn vị ${chosen.name}.`, 'danger');
        return;
      }
    }

    this.items.update((list) =>
      list.map((it, i) =>
        i === index
          ? {
              ...it,
              unit: chosen.name,
              unitConversion: chosen.conversion,
              price: chosen.price,
              listPrice: chosen.price,
              baseQty: newBaseQty,
              basePrice: basePriceFor(chosen.price, chosen.conversion),
            }
          : it
      )
    );
  }

  /** Sửa giá bán của 1 dòng (mỗi khách có thể bán 1 giá khác nhau) */
  setItemPrice(index: number, value: unknown): void {
    if (value === '' || value === null || value === undefined) return; // đang xóa để nhập lại
    const price = Math.max(0, Math.round(Number(value) || 0));
    this.items.update((list) =>
      list.map((item, i) => {
        if (i !== index) return item;
        const conversion = item.unitConversion > 0 ? item.unitConversion : 1;
        return { ...item, price, basePrice: basePriceFor(price, conversion) };
      })
    );
  }

  /** Trả giá dòng về giá niêm yết của đơn vị đang chọn. */
  resetItemPrice(index: number): void {
    const item = this.items()[index];
    if (!item) return;
    const product = this.products().find((p) => p.id === item.product_id);
    const price = findSaleUnit(product, item.unit)?.price ?? Number(product?.price ?? item.listPrice ?? item.price);
    const conversion = item.unitConversion > 0 ? item.unitConversion : 1;
    this.items.update((list) =>
      list.map((it, i) =>
        i === index
          ? { ...it, price, listPrice: price, basePrice: basePriceFor(price, conversion) }
          : it
      )
    );
  }

  /** Dòng có giá khác giá niêm yết? (hiện nút hoàn tác) */
  isCustomPrice(item: SaleItem): boolean {
    return item.listPrice != null && Math.round(item.price) !== Math.round(item.listPrice);
  }

  /** Nút + trên thẻ: thêm nhanh theo đơn vị mặc định. */
  quickAdd(ev: Event, p: Product) {
    ev.stopPropagation();
    const unit = defaultSaleUnit(p);
    if (this.addProduct(p, 1, unit)) {
      this.toast(`Đã thêm: ${p.name}${unit ? ` (${unit.name})` : ''}`);
    }
  }

  addByBarcode() {
    const code = this.barcodeInput.trim();
    if (!code) return;
    const found = this.products().find((p) => (p.sku ?? '').toLowerCase() === code.toLowerCase());
    if (found) {
      const unit = defaultSaleUnit(found);
      if (this.addProduct(found, 1, unit)) {
        this.toast(`Đã thêm: ${found.name}${unit ? ` (${unit.name})` : ''}`);
      }
    } else {
      this.toast(`Không tìm thấy sản phẩm mã "${code}"`, 'danger');
    }
    this.barcodeInput = '';
  }

  /** Nhập số lượng trực tiếp; vẫn giữ nút +/- để bấm nhanh. */
  setItemQty(index: number, ev: Event) {
    const input = ev.target as HTMLInputElement;
    const current = [...this.items()];
    const item = current[index];
    if (!item) return;

    const raw = input.value.trim();
    const parsed = Number(raw);
    if (!raw || !Number.isFinite(parsed) || parsed < 1) {
      input.value = String(item.qty);
      return;
    }

    const qty = Math.floor(parsed);
    const conversion = item.unitConversion > 0 ? item.unitConversion : 1;
    const newBaseQty = baseQtyFor(qty, conversion);
    const product = this.products().find((p) => p.id === item.product_id);
    if (product && !this.allowNegativeStock() && this.stockTrackedStatus()) {
      // Trừ phần số lượng đã có của chính dòng này để chỉ kiểm tra phần tăng thêm.
      const otherQty = this.currentQtyForProduct(item.product_id) - this.itemBaseQty(item);
      const original = item.product_id ? (this.originalQtyByProduct.get(item.product_id) ?? 0) : 0;
      const needed = Math.max(0, otherQty + newBaseQty - original);
      if (needed > Number(product.stock ?? 0)) {
        input.value = String(item.qty);
        this.toast(`Không đủ tồn kho cho "${item.name}". Còn ${product.stock}.`, 'danger');
        return;
      }
    }

    if (qty === item.qty) {
      input.value = String(qty);
      return;
    }

    current[index] = { ...item, qty, baseQty: newBaseQty };
    this.items.set(current);
    input.value = String(qty);
  }

  incQty(index: number) {
    const current = [...this.items()];
    const item = current[index];
    const product = this.products().find((p) => p.id === item.product_id);
    const conversion = item.unitConversion > 0 ? item.unitConversion : 1;
    if (product && !this.allowNegativeStock() && this.stockTrackedStatus()) {
      const nextTotal = this.currentQtyForProduct(item.product_id) + conversion;
      const original = item.product_id ? (this.originalQtyByProduct.get(item.product_id) ?? 0) : 0;
      const needed = Math.max(0, nextTotal - original);
      if (needed > Number(product.stock ?? 0)) {
        this.toast(
          `Không đủ tồn kho cho "${item.name}". Còn ${product.stock}, cần thêm ${this.formatNum(conversion)}.`,
          'danger'
        );
        return;
      }
    }
    current[index] = {
      ...item,
      qty: item.qty + 1,
      baseQty: baseQtyFor(item.qty + 1, conversion),
    };
    this.items.set(current);
  }

  /** Số lượng quy về đơn vị gốc của một dòng. */
  private itemBaseQty(item: SaleItem): number {
    return item.baseQty != null
      ? Number(item.baseQty)
      : baseQtyFor(item.qty, item.unitConversion ?? 1);
  }

  /** Giá quy về đơn vị gốc của một dòng. */
  private itemBasePrice(item: SaleItem): number {
    return item.basePrice != null
      ? Number(item.basePrice)
      : basePriceFor(item.price, item.unitConversion ?? 1);
  }

  /** Tổng số lượng (đơn vị gốc) hiện tại của 1 sản phẩm trong đơn đang mở */
  private currentQtyForProduct(productId: string | null): number {
    if (!productId) return 0;
    return this.items().reduce(
      (sum, item) => sum + (item.product_id === productId ? this.itemBaseQty(item) : 0),
      0
    );
  }

  /**
   * Trạng thái hiện tại có tính tồn kho không? Nháp/báo giá/đã hủy thì không,
   * nên không cần chặn thêm sản phẩm vượt tồn (khi lưu cũng không trừ kho).
   */
  private stockTrackedStatus(): boolean {
    return !['draft', 'quote', 'cancelled'].includes(this.status || 'completed');
  }

  decQty(index: number) {
    const current = [...this.items()];
    const item = current[index];
    if (!item) return;
    if (item.qty > 1) {
      const nextQty = item.qty - 1;
      current[index] = {
        ...item,
        qty: nextQty,
        baseQty: baseQtyFor(nextQty, item.unitConversion ?? 1),
      };
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

  /**
   * Mở danh sách khách hàng (modal toàn màn hình, có tìm kiếm) để chọn KH có sẵn.
   * Bấm 1 khách → tự điền tên/SĐT/địa chỉ vào đơn. Dùng modal để không mất sản phẩm đang nhập.
   */
  async selectCustomer() {
    const modal = await this.modalCtrl.create({
      component: CustomerPickerModalComponent,
      cssClass: 'customer-picker-modal',
      componentProps: { selectedId: this.selectedCustomerId },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<Customer | null>();
    if (role === 'select' && data) {
      this.selectedCustomerId = data.id;
      this.selectedCustomerName = data.name;
      this.customerPhone = data.phone ?? '';
      this.customerAddress = data.address ?? '';
      this.selectedCustomerDebt = Number(data.debt ?? 0);
      this.toast(`Đã chọn: ${data.name}`);
      return;
    }
    if (role === 'retail') {
      this.selectedCustomerId = null;
      this.selectedCustomerName = 'Khách lẻ';
      this.customerPhone = '';
      this.customerAddress = '';
      this.selectedCustomerDebt = 0;
    }
  }

  /** Chữ cái đầu của khách đang chọn (avatar) */
  customerInitial(): string {
    return (this.selectedCustomerName || '').trim().charAt(0).toUpperCase() || '?';
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
    if (this.busy()) return;
    if (this.editingOrderId()) {
      await this.saveEditOrder();
      return;
    }
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
          current.qty += this.itemBaseQty(item);
          requested.set(item.product_id, current);
        }
      }
      for (const [productId, request] of requested) {
        const stock = Number(this.products().find((p) => p.id === productId)?.stock ?? 0);
        if (request.qty > stock) {
          this.toast(
            `Không đủ tồn kho cho "${request.name}". Còn ${stock}, cần ${this.formatNum(request.qty)}.`,
            'danger'
          );
          return;
        }
      }
    }
    // "Khách đưa" chỉ là tiền khách đưa để tính tiền thừa. Nếu khách đưa
    // thiếu, KHÔNG được lưu đơn thành đã thanh toán đủ (sai sổ quỹ/công nợ).
    for (const order of withItems) {
      const billable = !['draft', 'quote', 'debt', 'ship_debt', 'consignment', 'cancelled'].includes(order.status);
      const tender = Number(order.customerPaid ?? 0);
      if (billable && tender > 0 && tender + 0.5 < this.dueOf(order)) {
        this.toast(
          `Đơn ${order.orderCode}: khách đưa ${this.formatMoney(tender)} nhưng phải trả ${this.formatMoney(this.dueOf(order))}. ` +
            'Hãy chọn trạng thái "Công nợ" nếu khách trả một phần.',
          'danger'
        );
        return;
      }
    }
    const empties = batch.length - withItems.length;
    this.busy.set(true);
    try {
      const extras = this.hasOrderExtras();
      let saved = 0;
      for (const s of withItems) {
        // Các trạng thái này chưa phát sinh doanh thu/thanh toán. Trước đây màn
        // Bán hàng luôn gửi paid=true nên chọn "Công nợ"/"Báo giá" vẫn ghi thu
        // đủ tiền và làm sai sổ quỹ/công nợ.
        const billable = !['draft', 'quote', 'debt', 'ship_debt', 'consignment', 'cancelled'].includes(s.status);
        await this.ordersService.create(
          {
            code: s.orderCode || this.ordersService.newCode(),
            customer_id: s.selectedCustomerId,
            customer_name: s.selectedCustomerName || 'Khách lẻ',
            status: s.status,
            discount: Math.round((s.items.reduce((sum, i) => sum + i.price * i.qty, 0) * Number(s.discountPercent ?? 0)) / 100),
            discount_percent: Math.max(0, Number(s.discountPercent ?? 0)),
            tax_percent: Math.max(0, Number(s.taxPercent ?? 0)),
            paid: billable,
            account_id: s.selectedAccountId,
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
          s.items.map((i) => ({
            product_id: i.product_id,
            name: i.name,
            // RPC và tồn kho luôn nhận đơn vị gốc; metadata đơn vị đi kèm để
            // OrdersService lưu lại cho phần hiển thị.
            price: this.itemBasePrice(i),
            qty: this.itemBaseQty(i),
            unit: i.unit,
            unit_qty: i.qty,
            unit_conversion: i.unitConversion,
            unit_price: i.price,
          })),
          {
            recordIncome: billable && this.dueOf(s) > 0,
            // Cùng nonce cho mọi lần thử của đơn này → server trả đơn cũ thay vì tạo trùng.
            idempotencyKey: s.nonce,
          }
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

  /** Lưu thay đổi của một đơn đã tạo từ màn hình Bán hàng. */
  private async saveEditOrder(): Promise<void> {
    const orderId = this.editingOrderId();
    const original = this.editingOrder();
    if (!orderId || !original) {
      await this.toast('Không xác định được đơn hàng cần sửa', 'danger');
      return;
    }

    const snap = this.currentSnap();
    if (!snap.items.length) {
      await this.toast('Đơn hàng phải còn ít nhất 1 sản phẩm. Hãy dùng nút Xóa đơn nếu muốn bỏ cả đơn.', 'danger');
      return;
    }
    if (snap.items.some((item) => !item.name.trim() || Number(item.qty) <= 0 || Number(item.price) < 0)) {
      await this.toast('Có dòng sản phẩm không hợp lệ. Hãy kiểm tra lại số lượng và giá bán.', 'danger');
      return;
    }

    this.busy.set(true);
    try {
      await this.ordersService.updateFullOrder(
        orderId,
        {
          code: snap.orderCode.trim() || original.code,
          customer_id: snap.selectedCustomerId,
          customer_name: snap.selectedCustomerName.trim() || 'Khách lẻ',
          status: snap.status,
          payment_method: snap.paymentMethod,
          account_id: snap.selectedAccountId,
          discount_percent: Math.max(0, Number(snap.discountPercent ?? 0)),
          tax_percent: Math.max(0, Number(snap.taxPercent ?? 0)),
          ship_fee: Math.max(0, Number(snap.shipFee ?? 0)),
          ship_fee_by_customer: !!snap.customerShipPaid,
          note: snap.note.trim() || null,
          customer_phone: snap.customerPhone.trim() || null,
          customer_address: snap.customerAddress.trim() || null,
          shipping_code: snap.shippingCode.trim() || null,
          shipping_partner: snap.shippingPartner.trim() || null,
          shipper_name: snap.shipperName.trim() || null,
          shipper_phone: snap.shipperPhone.trim() || null,
          shipping_address: snap.shippingAddress.trim() || null,
          created_at: this.fromLocalInput(snap.orderDate),
        },
        snap.items.map((item) => ({
          ...(item.id ? { id: item.id } : {}),
          product_id: item.product_id,
          name: item.name.trim(),
          price: Math.max(0, this.itemBasePrice(item)),
          qty: Math.max(0, this.itemBaseQty(item)),
          unit: item.unit,
          unit_qty: item.qty,
          unit_conversion: item.unitConversion,
          unit_price: item.price,
        }))
      );
      await this.toast('Đã cập nhật đơn hàng');
      this.router.navigateByUrl(`/order/${orderId}`, { replaceUrl: true });
    } catch (e: any) {
      await this.toast(e?.message ?? 'Cập nhật đơn hàng thất bại', 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  goBack() {
    const id = this.editingOrderId();
    if (id) {
      this.router.navigateByUrl(`/order/${id}`, { replaceUrl: true });
      return;
    }
    this.router.navigateByUrl('/home');
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  formatNum(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(Number(v ?? 0));
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

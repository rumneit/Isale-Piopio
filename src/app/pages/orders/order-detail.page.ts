import { Component, ElementRef, OnInit, effect, inject, signal, computed, viewChild } from '@angular/core';
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
  IonSpinner,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonNote,
  IonBackButton,
  IonSegment,
  IonSegmentButton,
  IonInput,
  AlertController,
  ToastController,
  ActionSheetController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  trashOutline,
  cashOutline,
  receiptOutline,
  personOutline,
  ellipseOutline,
  checkmarkCircleOutline,
  printOutline,
  returnDownBackOutline,
  cardOutline,
  cubeOutline,
  callOutline,
  locationOutline,
  swapVerticalOutline,
  barcodeOutline,
  qrCodeOutline,
  walletOutline,
  arrowDownCircleOutline,
  arrowUpCircleOutline,
  createOutline,
  closeOutline,
  saveOutline,
} from 'ionicons/icons';
import JsBarcode from 'jsbarcode';
import { OrdersService } from '../../core/services/orders.service';
import { ShipmentsService } from '../../core/services/shipments.service';
import { TransactionsService } from '../../core/services/transactions.service';
import { CustomersService } from '../../core/services/customers.service';
import { AuthService } from '../../core/services/auth.service';
import { Customer, Order, OrderItem, Shop, Shipment, Transaction } from '../../core/models/models';
import { ShipmentFormModalComponent } from '../shipments/shipment-form.modal';
import { ModalController } from '@ionic/angular';
import { SettingsService } from '../../core/services/settings.service';
import { InvoiceTemplateService, InvoiceTemplateKind } from '../../core/services/invoice-template.service';

@Component({
  selector: 'app-order-detail',
  templateUrl: './order-detail.page.html',
  styleUrls: ['./order-detail.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSpinner,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonNote,
    IonBackButton,
    IonSegment,
    IonSegmentButton,
    IonInput,
    FormsModule,
  ],
})
export class OrderDetailPage implements OnInit {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private ordersService = inject(OrdersService);
  private shipmentsService = inject(ShipmentsService);
  private transactionsService = inject(TransactionsService);
  private customersService = inject(CustomersService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private actionSheetCtrl = inject(ActionSheetController);
  private auth = inject(AuthService);
  private modalCtrl = inject(ModalController);
  private settings = inject(SettingsService);
  private invoiceTemplates = inject(InvoiceTemplateService);

  readonly order = signal<Order | null>(null);
  readonly items = signal<OrderItem[]>([]);
  /** Vận đơn liên quan (migration v25 — trống nếu chưa chạy migration) */
  readonly shipments = signal<Shipment[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  /** Các cột mở rộng v22 tồn tại trong DB (undefined -> ẩn khối vận chuyển/khách mở rộng) */
  readonly extras = signal<Set<string>>(new Set());
  /** Tab chi tiết — đồng bộ 4 tab của ISale */
  readonly tab = signal<'info' | 'debt' | 'barcode' | 'qr'>('info');
  readonly orderTransactions = signal<Transaction[]>([]);
  readonly customer = signal<Customer | null>(null);
  readonly shop = this.auth.shop;
  readonly barcodeCanvas = viewChild<ElementRef<HTMLCanvasElement>>('barcodeCanvas');

  /** Đã thu của đơn: ưu tiên trạng thái paid, sau đó cộng giao dịch gắn order_id */
  readonly paidAmount = computed(() => {
    const o = this.order();
    if (!o) return 0;
    const total = Math.max(0, Number(o.total ?? 0));
    if (o.paid) return total;
    const net = this.orderTransactions().reduce(
      (sum, t) => sum + (t.type === 'income' ? Number(t.amount ?? 0) : -Number(t.amount ?? 0)),
      0
    );
    return Math.min(total, Math.max(0, net));
  });

  readonly remainingAmount = computed(() =>
    Math.max(0, Number(this.order()?.total ?? 0) - this.paidAmount())
  );

  /** Tiền hàng = tổng các dòng sản phẩm */
  readonly merchandise = computed(() =>
    this.items().reduce((sum, item) => sum + Number(item.total ?? Number(item.price) * Number(item.qty)), 0)
  );

  /** Phí ship thực sự nằm trong tổng đơn (chỉ khi khách trả ship) */
  readonly shippingIncluded = computed(() => {
    const o = this.order();
    if (!o) return 0;
    return o.ship_fee_by_customer === false ? 0 : Math.max(0, Number(o.ship_fee ?? 0));
  });

  /** VAT suy ra từ tổng đơn: tổng = tiền hàng − chiết khấu + VAT + ship */
  readonly taxAmount = computed(() => {
    const o = this.order();
    if (!o) return 0;
    const tax =
      Number(o.total ?? 0) - this.merchandise() + Number(o.discount ?? 0) - this.shippingIncluded();
    return Math.max(0, Math.round(tax));
  });

  /** Chế độ sửa đơn (xóa sản phẩm / đổi giá) */
  readonly editMode = signal(false);
  readonly draftItems = signal<OrderItem[]>([]);

  startEdit(): void {
    this.draftItems.set(this.items().map((item) => ({ ...item })));
    this.editMode.set(true);
  }

  cancelEdit(): void {
    this.editMode.set(false);
    this.draftItems.set([]);
  }

  removeDraftItem(index: number): void {
    this.draftItems.update((list) => list.filter((_, i) => i !== index));
  }

  setDraftPrice(index: number, value: unknown): void {
    if (value === '' || value === null || value === undefined) return; // đang xóa để nhập lại
    const price = Math.max(0, Math.round(Number(value) || 0));
    this.draftItems.update((list) =>
      list.map((item, i) => (i === index ? { ...item, price, total: price * Number(item.qty) } : item))
    );
  }

  async saveEdit(): Promise<void> {
    const order = this.order();
    if (!order || this.busy()) return;
    const draft = this.draftItems();
    if (!draft.length) {
      await this.toast('Đơn hàng phải còn ít nhất 1 sản phẩm. Hãy dùng nút Xóa đơn nếu muốn bỏ cả đơn.', 'danger');
      return;
    }
    this.busy.set(true);
    try {
      const before = this.items();
      const oldMerchandise = this.merchandise();
      const oldTax = this.taxAmount();
      const keep = new Set(draft.map((item) => item.id));
      for (const item of before) {
        if (!keep.has(item.id)) await this.ordersService.removeItem(item.id);
      }
      for (const item of draft) {
        const previous = before.find((row) => row.id === item.id);
        const price = Math.max(0, Math.round(Number(item.price) || 0));
        if (previous && Math.round(Number(previous.price)) !== price) {
          await this.ordersService.updateItem(item.id, { price, total: price * Number(item.qty) });
        }
      }
      const newMerchandise = draft.reduce(
        (sum, item) => sum + Math.max(0, Math.round(Number(item.price) || 0)) * Number(item.qty),
        0
      );
      // Giữ nguyên tỷ lệ VAT so với tiền hàng để bill vẫn khớp
      const newTax = oldMerchandise > 0 ? Math.round(oldTax * (newMerchandise / oldMerchandise)) : 0;
      const discount = Math.min(Number(order.discount ?? 0), newMerchandise);
      const total = Math.max(0, newMerchandise - discount + newTax + this.shippingIncluded());
      await this.ordersService.update(order.id, { total, discount });
      // Đơn đã thu tiền: giữ khoản thu khớp với tổng mới để báo cáo doanh thu không lệch
      if (order.paid) {
        const income = this.orderTransactions().find((t) => t.type === 'income');
        const delta = total - Number(order.total ?? 0);
        if (income && delta !== 0) {
          await this.transactionsService
            .update(income.id, { amount: Math.max(0, Number(income.amount ?? 0) + delta) })
            .catch(() => {});
        }
      }
      await this.load();
      this.editMode.set(false);
      this.draftItems.set([]);
      await this.toast('Đã cập nhật đơn hàng');
    } catch (e: any) {
      await this.toast(e?.message ?? 'Cập nhật đơn hàng thất bại', 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  constructor() {
    addIcons({ trashOutline, cashOutline, receiptOutline, personOutline, ellipseOutline, checkmarkCircleOutline, printOutline, returnDownBackOutline, cardOutline, cubeOutline, callOutline, locationOutline, swapVerticalOutline, barcodeOutline, qrCodeOutline, walletOutline, arrowDownCircleOutline, arrowUpCircleOutline, createOutline, closeOutline, saveOutline });
    // Canvas chỉ tồn tại khi tab Mã vạch được render — vẽ lại mỗi khi tab/canvas sẵn sàng
    effect(() => {
      if (this.tab() === 'barcode' && this.barcodeCanvas()) {
        setTimeout(() => this.drawBarcode());
      }
    });
  }

  goReturn() {
    const o = this.order();
    if (o) {
      this.router.navigateByUrl(`/order/${o.id}/return`);
    }
  }

  async ngOnInit(): Promise<void> {
    await this.settings.load();
    this.hasPaymentMethod = await this.ordersService.detectPaymentMethod().catch(() => false);
    this.extras.set(await this.ordersService.detectOrderExtras().catch(() => new Set<string>()));
    await this.load();
  }

  hasPaymentMethod = false;

  private async load() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.loading.set(true);
    try {
      const { order, items } = await this.ordersService.getWithItems(id);
      this.order.set(order);
      this.items.set(items);
      this.orderTransactions.set([]);
      this.customer.set(null);
      if (order) void this.loadPaymentInfo(order);
      // Vận đơn liên quan (im lặng khi chưa chạy migration v25)
      this.shipmentsService
        .listByOrder(id)
        .then((list) => this.shipments.set(list))
        .catch(() => this.shipments.set([]));
    } catch (e: any) {
      console.error('load order failed', e);
    } finally {
      this.loading.set(false);
    }
  }

  /** Tải giao dịch thanh toán + công nợ khách hàng (im lặng nếu DB chưa có cột/bảng) */
  private async loadPaymentInfo(order: Order): Promise<void> {
    const [transactions, customer] = await Promise.all([
      this.transactionsService.listByOrder(order.id).catch(() => [] as Transaction[]),
      order.customer_id
        ? this.customersService.get(order.customer_id).catch(() => null)
        : Promise.resolve(null),
    ]);
    if (this.order()?.id !== order.id) return;
    this.orderTransactions.set(transactions);
    this.customer.set(customer);
  }

  selectTab(value: string): void {
    const tab = (['info', 'debt', 'barcode', 'qr'].includes(value) ? value : 'info') as
      | 'info'
      | 'debt'
      | 'barcode'
      | 'qr';
    this.tab.set(tab);
  }

  /** Ghi nhận thu nợ từng phần; đủ tiền thì tự đánh dấu đã thanh toán */
  async recordPayment(): Promise<void> {
    const order = this.order();
    if (!order) return;
    const remaining = this.remainingAmount();
    if (remaining <= 0) return;
    const alert = await this.alertCtrl.create({
      header: 'Ghi nhận thanh toán',
      message: `Còn nợ ${this.formatMoney(remaining)}`,
      inputs: [
        {
          name: 'amount',
          type: 'number',
          min: 1,
          max: remaining,
          value: String(Math.round(remaining)),
          placeholder: 'Số tiền thu',
        },
        { name: 'note', type: 'text', placeholder: 'Ghi chú (không bắt buộc)' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Lưu',
          handler: (data) => {
            const amount = Number(data.amount);
            if (!(amount > 0) || amount > remaining) {
              void this.toast('Số tiền không hợp lệ.', 'danger');
              return false;
            }
            void this.doRecordPayment(amount, String(data.note ?? '').trim());
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async doRecordPayment(amount: number, note: string): Promise<void> {
    const order = this.order();
    if (!order) return;
    this.busy.set(true);
    try {
      const fullyPaid = this.paidAmount() + amount >= Number(order.total ?? 0) - 0.5;
      await this.transactionsService.create({
        type: 'income',
        category: 'Thu nợ',
        amount,
        note: note || `Thu tiền đơn ${order.code}`,
        occurred_at: new Date().toISOString(),
        order_id: order.id,
        payment_type: 'CASH',
        source: 'order',
      });
      if (fullyPaid) await this.ordersService.update(order.id, { paid: true });
      await this.load();
      this.toast('Đã ghi nhận thanh toán');
    } catch (e: any) {
      this.toast(e?.message ?? 'Ghi nhận thanh toán thất bại', 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  // ===== Mã vạch đơn hàng (Code128 như ISale) =====
  private drawBarcode(): void {
    const canvas = this.barcodeCanvas()?.nativeElement;
    const order = this.order();
    if (!canvas || !order) return;
    const value = (order.code || order.id || '').trim() || order.id;
    try {
      JsBarcode(canvas, value, {
        format: 'CODE128',
        width: 2,
        height: 72,
        displayValue: true,
        fontSize: 14,
        margin: 8,
        background: '#ffffff',
        lineColor: '#000000',
      });
    } catch {
      try {
        JsBarcode(canvas, value.replace(/[^A-Za-z0-9\-\.\ \$\/\+\%]/g, '') || '0', {
          format: 'CODE128',
          height: 72,
        });
      } catch {
        /* bỏ qua */
      }
    }
  }

  printBarcode(): void {
    const canvas = this.barcodeCanvas()?.nativeElement;
    if (!canvas) return;
    this.drawBarcode();
    const url = canvas.toDataURL('image/png');
    const w = window.open('', '_blank', 'width=520,height=360');
    if (!w) {
      this.toast('Trình chặn popup đang bật. Hãy cho phép popup để in mã vạch.', 'warning');
      return;
    }
    w.document.write(
      `<html><head><title>In mã vạch</title></head><body style="display:flex;align-items:center;justify-content:center;margin:0"><img src="${url}" onload="window.focus();window.print()" style="max-width:90%"/></body></html>`
    );
    w.document.close();
  }

  openBankSettings(): void {
    this.router.navigateByUrl('/config');
  }

  async togglePaid() {
    const order = this.order();
    if (!order) return;
    this.busy.set(true);
    try {
      await this.ordersService.update(order.id, { paid: !order.paid });
      await this.load();
      this.toast(order.paid ? 'Đã chuyển sang còn nợ' : 'Đã đánh dấu đã thanh toán');
    } catch (e: any) {
      this.toast(e?.message ?? 'Cập nhật thất bại', 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  /** Đổi trạng thái đơn (ISale: 8 mức trạng thái) */
  async changeStatus() {
    const order = this.order();
    if (!order) return;
    const buttons = OrdersService.orderStatuses.map((s) => ({
      text: (order.status === s.value ? '✓ ' : '') + s.label,
      handler: async () => {
        if (order.status === s.value) return;
        this.busy.set(true);
        try {
          await this.ordersService.update(order.id, { status: s.value });
          await this.load();
          this.toast(`Đã chuyển sang "${s.label}"`);
        } catch (e: any) {
          this.toast(e?.message ?? 'Đổi trạng thái thất bại', 'danger');
        } finally {
          this.busy.set(false);
        }
      },
    }));
    const sheet = await this.actionSheetCtrl.create({
      header: 'Đổi trạng thái đơn hàng',
      buttons: [...buttons, { text: 'Hủy', role: 'cancel' }],
    });
    await sheet.present();
  }

  /** Đổi hình thức thanh toán (ISale: 10 mã) */
  async changePayment() {
    const order = this.order();
    if (!order) return;
    const buttons = OrdersService.paymentMethods.map((m) => ({
      text: ((order.payment_method ?? 'CASH') === m.value ? '✓ ' : '') + m.label,
      handler: async () => {
        if ((order.payment_method ?? 'CASH') === m.value) return;
        this.busy.set(true);
        try {
          await this.ordersService.update(order.id, { payment_method: m.value });
          await this.load();
          this.toast(`Hình thức thanh toán: ${m.label}`);
        } catch (e: any) {
          this.toast(e?.message ?? 'Cập nhật thất bại', 'danger');
        } finally {
          this.busy.set(false);
        }
      },
    }));
    const sheet = await this.actionSheetCtrl.create({
      header: 'Hình thức thanh toán',
      buttons: [...buttons, { text: 'Hủy', role: 'cancel' }],
    });
    await sheet.present();
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

  /** Đơn có dữ liệu vận chuyển / khách mở rộng để hiển thị? */
  hasShippingInfo(o: Order): boolean {
    if (!this.extras().size) return false;
    return Boolean(
      o.shipping_code ||
        o.shipping_partner ||
        o.shipper_name ||
        o.shipper_phone ||
        o.shipping_address ||
        (o.ship_fee ?? 0) > 0
    );
  }

  /** Có khối vận chuyển để render (cũ v22 hoặc vận đơn v25)? */
  shouldShowShippingCard(o: Order): boolean {
    return this.shipments().length > 0 || this.hasShippingInfo(o);
  }

  /** Tạo vận đơn từ đơn hàng (prefill người nhận/mã cũ) */
  async openCreateShipment() {
    const o = this.order();
    if (!o) return;
    if (this.shipmentsService.migrationNeeded()) {
      const alert = await this.alertCtrl.create({
        header: 'Cần nâng cấp dữ liệu',
        message:
          'Bảng vận đơn chưa tồn tại. Hãy chạy supabase-migration-v25.sql trong Supabase SQL Editor, sau đó tải lại trang.',
        buttons: ['Đã hiểu'],
      });
      await alert.present();
      return;
    }
    const modal = await this.modalCtrl.create({
      component: ShipmentFormModalComponent,
      componentProps: {
        order: o,
        prefillTrackingCode: o.shipping_code ?? null,
        prefillAddress:
          [o.customer_name, o.customer_phone, o.shipping_address || o.customer_address]
            .filter(Boolean)
            .join(' · ') || null,
      },
    });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'save') await this.load();
  }

  openShipment(shipmentId: string) {
    this.router.navigateByUrl(`/shipments/detail/${shipmentId}`);
  }

  shipmentStatusLabel(s: string): string {
    return ShipmentsService.statusLabel(s);
  }

  shipmentStatusColor(s: string): string {
    return ShipmentsService.statusColor(s);
  }

  /** QR VietQR cho đơn (khi shop đã cấu hình ngân hàng) */
  qrUrlFor(o: Order): string {
    const shop = this.auth.shop() as (Shop & { bank_code?: string | null }) | null;
    const bank = (shop?.bank_code ?? '').trim();
    const acc = (shop?.bank_account ?? '').trim();
    if (!bank || !acc) return '';
    const info = encodeURIComponent(o.code || 'Thanh toan');
    const owner = encodeURIComponent((shop?.bank_owner ?? '').trim());
    return (
      `https://img.vietqr.io/image/${bank}-${acc}-compact2.png` +
      `?amount=${Math.max(0, Math.round(Number(o.total ?? 0)))}&addInfo=${info}` +
      (owner ? `&accountName=${owner}` : '')
    );
  }

  async confirmDelete() {
    const order = this.order();
    if (!order) return;
    const alert = await this.alertCtrl.create({
      header: 'Xóa đơn hàng',
      message: `Xóa đơn ${order.code}? Hành động này không thể hoàn tác.`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        { text: 'Xóa', role: 'destructive', handler: () => this.doDelete() },
      ],
    });
    await alert.present();
  }

  private async doDelete() {
    const order = this.order();
    if (!order) return;
    this.busy.set(true);
    try {
      await this.ordersService.remove(order.id);
      this.toast('Đã xóa đơn hàng');
      this.router.navigateByUrl('/order', { replaceUrl: true });
    } catch (e: any) {
      this.toast(e?.message ?? 'Xóa thất bại', 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }

  printInvoice() {
    const o = this.order();
    if (!o) return;
    const kind: InvoiceTemplateKind = this.settings.booleanValue('print_large_invoice', true) ? 'invoice' : 'receipt';
    const paperSize = this.invoiceTemplates.normalizePaperSize(this.settings.get('invoice_paper_size'));
    const key = kind === 'invoice' ? 'invoice_template_large' : 'invoice_template_receipt';
    const legacy = kind === 'invoice' ? this.settings.get('invoice_template') : null;
    const template = this.settings.get(key) ?? legacy ?? this.invoiceTemplates.defaultFor(kind);
    try {
      const opened = this.invoiceTemplates.openPrint(template, kind, this.invoiceTemplates.context({
        order: o,
        items: this.items(),
        shop: this.auth.shop(),
        qrCodeUrl: this.settings.booleanValue('print_qr') ? this.qrUrlFor(o) : '',
        printNote: this.settings.get('print_note') ?? '',
        emptyRows: this.settings.numberValue('invoice_empty_rows', 2),
        hideDiscountColumn: this.settings.booleanValue('hide_discount_column'),
        staffDisplay: this.auth.profile()?.full_name ?? '',
        showTax: !this.settings.booleanValue('hide_tax'),
      }), paperSize);
      if (!opened) this.toast('Trình chặn popup đang bật. Hãy cho phép popup để in.', 'warning');
    } catch (error: any) {
      this.toast(error?.message ?? 'Không thể dựng template hóa đơn.', 'danger');
    }
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  totalQty(): number {
    const list = this.editMode() ? this.draftItems() : this.items();
    return list.reduce((s, i) => s + Number(i.qty ?? 0), 0);
  }
}

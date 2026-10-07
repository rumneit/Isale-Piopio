import { Component, OnInit, inject, signal } from '@angular/core';
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
  AlertController,
  ToastController,
  ActionSheetController,
} from '@ionic/angular';
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
} from 'ionicons/icons';
import { OrdersService } from '../../core/services/orders.service';
import { ShipmentsService } from '../../core/services/shipments.service';
import { AuthService } from '../../core/services/auth.service';
import { Order, OrderItem, Shop, Shipment } from '../../core/models/models';
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

  constructor() {
    addIcons({ trashOutline, cashOutline, receiptOutline, personOutline, ellipseOutline, checkmarkCircleOutline, printOutline, returnDownBackOutline, cardOutline, cubeOutline, callOutline, locationOutline, swapVerticalOutline });
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
    const kind: InvoiceTemplateKind = this.settings.booleanValue('print_large_invoice') ? 'invoice' : 'receipt';
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
      }));
      if (!opened) this.toast('Trình chặn popup đang bật. Hãy cho phép popup để in.', 'warning');
    } catch (error: any) {
      this.toast(error?.message ?? 'Không thể dựng template hóa đơn.', 'danger');
    }
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  totalQty(): number {
    return this.items().reduce((s, i) => s + (i.qty ?? 0), 0);
  }

  /** Tiền hàng = tổng cộng + giảm giá − phí ship (nếu khách trả ship) — đúng ngược công thức bán hàng */
  sumMerchandise(o: Order): number {
    const ship = o.ship_fee_by_customer ? Number(o.ship_fee ?? 0) : 0;
    return Number(o.total ?? 0) + Number(o.discount ?? 0) - ship;
  }
}

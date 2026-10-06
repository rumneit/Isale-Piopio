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
    const items = this.items();
    const shopName = this.auth.shop()?.name ?? 'PioPio';
    const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const money = (v: number) => new Intl.NumberFormat('vi-VN').format(Math.round(v)) + '₫';

    const rows = items
      .map(
        (i) => `<tr>
          <td class="l">${esc(i.name)}<br><small>${i.qty} × ${money(i.price)}</small></td>
          <td class="r">${money(i.total)}</td>
        </tr>`
      )
      .join('');

    const qr = this.qrUrlFor(o);
    const shipFee = Number(o.ship_fee ?? 0);
    const shipHtml =
      this.hasShippingInfo(o) && shipFee > 0
        ? `<tr><td class="l">Phi van chuyen${o.ship_fee_by_customer ? '' : ' (shop tra)'}</td><td class="r">${money(shipFee)}</td></tr>`
        : '';
    const shipInfo =
      this.hasShippingInfo(o)
        ? `<hr>
  <table>
    ${o.shipping_code ? `<tr><td class="l">Ma van don: <b>${esc(o.shipping_code)}</b>${o.shipping_partner ? ' - ' + esc(o.shipping_partner) : ''}</td></tr>` : ''}
    ${o.shipper_name ? `<tr><td class="l">Shipper: ${esc(o.shipper_name)}${o.shipper_phone ? ' - ' + esc(o.shipper_phone) : ''}</td></tr>` : ''}
    ${o.shipping_address ? `<tr><td class="l">Giao den: ${esc(o.shipping_address)}</td></tr>` : ''}
  </table>`
        : '';
    const qrHtml = qr
      ? `<hr>
  <p class="center"><img src="${qr}" alt="QR thanh toan" width="180" height="180"></p>
  <p class="center muted">Quet ma QR de thanh toan</p>`
      : '';

    const html = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"><title>Hoa don ${esc(o.code)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 13px; padding: 10px; width: 320px; color: #000; }
  h1 { font-size: 17px; text-align: center; margin-bottom: 2px; }
  .center { text-align: center; }
  .muted { font-size: 11px; }
  hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3px 0; vertical-align: top; }
  .l { text-align: left; } .r { text-align: right; white-space: nowrap; }
  .total { font-size: 15px; font-weight: bold; }
  .thanks { margin-top: 10px; text-align: center; }
  @media print { body { width: 100%; } }
</style></head>
<body>
  <h1>${esc(shopName)}</h1>
  <p class="center muted">Hoa don ban hang</p>
  <hr>
  <table>
    <tr><td class="l">So: <b>${esc(o.code)}</b></td><td class="r">${esc(this.fmtDate(o.created_at))}</td></tr>
    <tr><td class="l">Khach: <b>${esc(o.customer_name ?? 'Khach le')}</b>${o.customer_phone ? ' - ' + esc(o.customer_phone) : ''}</td><td class="r">${o.paid ? 'DA THANH TOAN' : 'CON NO'}</td></tr>
    <tr><td class="l">Trang thai: <b>${esc(this.statusLabel(o.status))}</b></td><td class="r">${esc(this.paymentLabel(o.payment_method))}</td></tr>
  </table>
  <hr>
  <table>${rows}</table>
  <hr>
  <table>
    ${o.discount ? `<tr><td class="l">Giam gia</td><td class="r">-${money(o.discount)}</td></tr>` : ''}
    ${shipHtml}
    <tr class="total"><td class="l">TONG CONG</td><td class="r">${money(o.total)}</td></tr>
  </table>${shipInfo}${qrHtml}
  <p class="thanks muted">Cam on quy khach — Hen gap lai!</p>
  <script>window.onload = function () { window.print(); };</script>
</body></html>`;

    const w = window.open('', '_blank', 'width=380,height=640');
    if (!w) {
      this.toast('Trình chặn popup đang bật. Hãy cho phép popup để in.', 'warning');
      return;
    }
    w.document.write(html);
    w.document.close();
  }

  private fmtDate(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
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

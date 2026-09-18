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
} from 'ionicons/icons';
import { OrdersService } from '../../core/services/orders.service';
import { AuthService } from '../../core/services/auth.service';
import { Order, OrderItem } from '../../core/models/models';

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
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private ordersService = inject(OrdersService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private auth = inject(AuthService);

  readonly order = signal<Order | null>(null);
  readonly items = signal<OrderItem[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);

  constructor() {
    addIcons({ trashOutline, cashOutline, receiptOutline, personOutline, ellipseOutline, checkmarkCircleOutline, printOutline });
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.loading.set(true);
    try {
      const { order, items } = await this.ordersService.getWithItems(id);
      this.order.set(order);
      this.items.set(items);
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
    const shopName = this.auth.shop()?.name ?? 'ISale';
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
    <tr><td class="l">Khach: <b>${esc(o.customer_name ?? 'Khach le')}</b></td><td class="r">${o.paid ? 'DA THANH TOAN' : 'CON NO'}</td></tr>
  </table>
  <hr>
  <table>${rows}</table>
  <hr>
  <table>
    ${o.discount ? `<tr><td class="l">Giam gia</td><td class="r">-${money(o.discount)}</td></tr>` : ''}
    <tr class="total"><td class="l">TONG CONG</td><td class="r">${money(o.total)}</td></tr>
  </table>
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
}

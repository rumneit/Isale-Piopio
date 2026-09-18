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
} from 'ionicons/icons';
import { OrdersService } from '../../core/services/orders.service';
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

  readonly order = signal<Order | null>(null);
  readonly items = signal<OrderItem[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);

  constructor() {
    addIcons({ trashOutline, cashOutline, receiptOutline, personOutline, ellipseOutline, checkmarkCircleOutline });
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

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}

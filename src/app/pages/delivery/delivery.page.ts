import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonIcon,
  IonContent,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonList,
  IonItem,
  IonBadge,
  IonSpinner,
  IonRefresher,
  IonRefresherContent,
  IonNote,
  ActionSheetController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { boatOutline, timeOutline, checkmarkDoneOutline, flagOutline } from 'ionicons/icons';
import { OrdersService } from '../../core/services/orders.service';
import { Order } from '../../core/models/models';

@Component({
  selector: 'app-delivery',
  templateUrl: './delivery.page.html',
  styleUrls: ['./delivery.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonIcon,
    IonContent,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonList,
    IonItem,
    IonBadge,
    IonSpinner,
    IonRefresher,
    IonRefresherContent,
    IonNote,
  ],
})
export class DeliveryPage implements OnInit {
  readonly ordersService = inject(OrdersService);
  private actionSheetCtrl = inject(ActionSheetController);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);

  readonly statusOptions = [
    { value: 'pending', label: 'Chờ xử lý' },
    { value: 'shipping', label: 'Đang giao' },
    { value: 'delivered', label: 'Đã giao' },
    { value: 'completed', label: 'Hoàn tất' },
  ] as const;

  readonly items = signal<Order[]>([]);
  readonly loading = signal(true);
  readonly statusFilter = signal<string>('pending');
  search = '';

  constructor() {
    addIcons({ boatOutline, timeOutline, checkmarkDoneOutline, flagOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.ordersService.list(this.search, 'all', this.statusFilter()));
    } catch (e: any) {
      console.error('load delivery orders failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async onSearch(ev: CustomEvent) {
    this.search = (ev.detail as any).value ?? '';
    await this.load();
  }

  async onFilter(ev: CustomEvent) {
    this.statusFilter.set(ev.detail.value as string);
    await this.load();
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  statusLabel(status: string | null | undefined): string {
    return OrdersService.statusLabel(status);
  }

  openDetail(order: Order) {
    this.router.navigateByUrl(`/order/${order.id}`);
  }

  async changeStatus(order: Order) {
    const sheet = await this.actionSheetCtrl.create({
      header: `${order.code} — ${OrdersService.statusLabel(order.status)}`,
      buttons: [
        ...OrdersService.orderStatuses
          .filter((s) => s.value !== order.status)
          .map((s) => ({
            text: s.label,
            handler: async () => {
              try {
                await this.ordersService.update(order.id, { status: s.value });
                await this.load();
                this.toast(`Đã chuyển sang "${s.label}"`);
              } catch (e: any) {
                this.toast(e?.message ?? 'Cập nhật thất bại', 'danger');
              }
            },
          })),
        { text: 'Hủy', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1600, color, position: 'bottom' });
    await t.present();
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}

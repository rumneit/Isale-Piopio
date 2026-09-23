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
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonSpinner,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  IonFab,
  IonFabButton,
  IonButton,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, receiptOutline, closeOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { FabTrioComponent } from '../../shared/fab-trio/fab-trio.component';
import { OrdersService } from '../../core/services/orders.service';
import { Order } from '../../core/models/models';

@Component({
  selector: 'app-quotes',
  templateUrl: './quotes.page.html',
  styleUrls: ['./quotes.page.scss'],
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
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonSpinner,
    IonNote,
    IonRefresher,
    IonRefresherContent,
    IonFab,
    IonFabButton,
    IonButton,
      FabTrioComponent,
  ],
})
export class QuotesPage implements OnInit {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  private ordersService = inject(OrdersService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);

  readonly items = signal<Order[]>([]);
  readonly loading = signal(true);
  search = '';

  constructor() {
    addIcons({ addOutline, receiptOutline, closeOutline, checkmarkCircleOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.ordersService.list(this.search, 'all', 'quote'));
    } catch (e: any) {
      console.error('load quotes failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async onSearch(ev: CustomEvent) {
    this.search = (ev.detail as any).value ?? '';
    await this.load();
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  openDetail(order: Order) {
    this.router.navigateByUrl(`/order/${order.id}`);
  }

  openAdd() {
    this.router.navigate(['/order/add'], { queryParams: { mode: 'quote' } });
  }

  async closeDeal(order: Order) {
    const alert = await this.alertCtrl.create({
      header: 'Chốt thành đơn hàng',
      message: `Chốt báo giá ${order.code} (${this.formatMoney(order.total)}) thành đơn hàng chờ xử lý?`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Chốt đơn',
          handler: async () => {
            try {
              await this.ordersService.update(order.id, { status: 'pending' });
              this.toast(`Đã chốt đơn ${order.code}`);
              await this.load();
            } catch (e: any) {
              this.toast(e?.message ?? 'Chốt đơn thất bại', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1600, color, position: 'bottom' });
    await t.present();
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}

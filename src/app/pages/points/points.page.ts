import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  IonButton,
  IonRefresher,
  IonRefresherContent,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  starOutline,
  personOutline,
  addCircleOutline,
  removeCircleOutline,
  timeOutline,
  giftOutline,
} from 'ionicons/icons';
import { CustomersService } from '../../core/services/customers.service';
import { PointsService, PointTransaction } from '../../core/services/points.service';
import { Customer } from '../../core/models/models';

@Component({
  selector: 'app-points',
  templateUrl: './points.page.html',
  styleUrls: ['./points.page.scss'],
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
    IonButton,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class PointsPage implements OnInit {
  readonly pointsService = inject(PointsService);
  private customersService = inject(CustomersService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly items = signal<Customer[]>([]);
  readonly loading = signal(true);
  readonly history = signal<PointTransaction[]>([]);
  readonly historyCustomer = signal<Customer | null>(null);
  search = '';

  constructor() {
    addIcons({ starOutline, personOutline, addCircleOutline, removeCircleOutline, timeOutline, giftOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.customersService.list(this.search));
    } catch (e: any) {
      console.error('load customers failed', e);
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

  async viewHistory(customer: Customer) {
    try {
      const rows = await this.pointsService.history(customer.id);
      this.historyCustomer.set(customer);
      this.history.set(rows);
    } catch (e: any) {
      this.toast(e?.message ?? 'Không tải được lịch sử', 'danger');
    }
  }

  closeHistory() {
    this.history.set([]);
    this.historyCustomer.set(null);
  }

  async addPoints(customer: Customer) {
    const alert = await this.alertCtrl.create({
      header: `Cộng điểm — ${customer.name}`,
      message: `Điểm hiện tại: ${this.fmt(customer.points)}`,
      inputs: [
        { name: 'points', type: 'number', placeholder: 'Số điểm cộng', min: 1 },
        { name: 'note', type: 'text', placeholder: 'Lý do (tùy chọn)' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Cộng điểm',
          handler: async (data) => {
            const points = Number(data?.points ?? 0);
            if (!points || points <= 0) {
              this.toast('Số điểm không hợp lệ', 'danger');
              return false;
            }
            try {
              await this.pointsService.adjust(customer.id, points, data?.note ?? '');
              this.toast(`Đã cộng ${this.fmt(points)} điểm`);
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async redeemPoints(customer: Customer) {
    const alert = await this.alertCtrl.create({
      header: `Đổi điểm — ${customer.name}`,
      message: `Điểm hiện tại: ${this.fmt(customer.points)}\nMỗi ${this.pointsService.earnRate.toLocaleString('vi-VN')}₫ mua hàng = 1 điểm`,
      inputs: [
        { name: 'points', type: 'number', placeholder: 'Số điểm cần đổi', min: 1 },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Đổi điểm',
          handler: async (data) => {
            const points = Number(data?.points ?? 0);
            try {
              await this.pointsService.redeem(customer, points);
              this.toast(`Đã trừ ${this.fmt(points)} điểm`);
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  typeLabel(type: string): string {
    switch (type) {
      case 'earn':
        return 'Tích điểm';
      case 'redeem':
        return 'Đổi điểm';
      default:
        return 'Điều chỉnh';
    }
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }

  fmt(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0);
  }
}

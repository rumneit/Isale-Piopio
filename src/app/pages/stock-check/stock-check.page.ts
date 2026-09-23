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
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonSpinner,
  IonButton,
  IonSearchbar,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  IonFab,
  IonFabButton,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  clipboardOutline,
  addOutline,
  checkmarkDoneOutline,
  timeOutline,
  closeCircleOutline,
  trashOutline,
} from 'ionicons/icons';
import { StockCountsService } from '../../core/services/stock-counts.service';
import { StockCount } from '../../core/models/models';

@Component({
  selector: 'app-stock-check',
  templateUrl: './stock-check.page.html',
  styleUrls: ['./stock-check.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonSpinner,
    IonButton,
    IonSearchbar,
    IonNote,
    IonRefresher,
    IonRefresherContent,
    IonFab,
    IonFabButton,
  ],
})
export class StockCheckPage implements OnInit {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  private stockCountsService = inject(StockCountsService);
  private router = inject(Router);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly items = signal<StockCount[]>([]);
  readonly loading = signal(true);
  search = '';

  constructor() {
    addIcons({ clipboardOutline, addOutline, checkmarkDoneOutline, timeOutline, closeCircleOutline, trashOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.stockCountsService.list(this.search));
    } catch (e: any) {
      console.error('load stock counts failed', e);
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

  openDetail(count: StockCount) {
    this.router.navigateByUrl(`/stock-check/${count.id}`);
  }

  openNew() {
    this.router.navigateByUrl('/stock-check/new');
  }

  statusLabel(status: StockCount['status']): string {
    return { draft: 'Nháp', completed: 'Đã chốt', cancelled: 'Đã hủy' }[status];
  }

  statusColor(status: StockCount['status']): string {
    return { draft: 'warning', completed: 'success', cancelled: 'medium' }[status];
  }

  statusIcon(status: StockCount['status']): string {
    return {
      draft: 'time-outline',
      completed: 'checkmark-done-outline',
      cancelled: 'close-circle-outline',
    }[status];
  }

  async confirmRemove(count: StockCount, ev: Event) {
    ev.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Xóa phiếu kiểm kê',
      message: `Xóa phiếu ${count.code}? Chỉ xóa được phiếu nháp.`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: async () => {
            try {
              await this.stockCountsService.remove(count.id);
              this.toast('Đã xóa phiếu');
              await this.load();
            } catch (e: any) {
              this.toast(e?.message ?? 'Xóa thất bại', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

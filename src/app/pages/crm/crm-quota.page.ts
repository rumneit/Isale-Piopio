import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonFab, IonFabButton,
  IonRefresher, IonRefresherContent, AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, speedometerOutline, trashOutline } from 'ionicons/icons';
import { CrmDealsService, CrmQuota } from '../../core/services/crm-deals.service';

@Component({
  selector: 'app-crm-quota',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonFab,
    IonFabButton, IonRefresher, IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/crm" /></ion-buttons>
        <ion-title>Chỉ tiêu doanh số</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($any($event))">
        <ion-refresher-content />
      </ion-refresher>
      <div class="app-page-container">
        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else if (items().length === 0) {
          <div class="app-empty">
            <div><ion-icon name="speedometer-outline" /></div>
            Chưa có chỉ tiêu. Nhấn + để đặt mục tiêu theo tháng.
          </div>
        } @else {
          <div class="app-card">
            <ion-list lines="full">
              @for (q of items(); track q.id) {
                <ion-item button (click)="openEdit(q)" detail="false">
                  <ion-icon slot="start" name="speedometer-outline" color="primary" />
                  <ion-label>
                    <h3>Kỳ {{ q.period }}</h3>
                    <p>{{ q.note ?? 'Không ghi chú' }}</p>
                  </ion-label>
                  <ion-badge slot="end" color="tertiary">{{ formatMoney(q.target_amount) }}</ion-badge>
                </ion-item>
              }
            </ion-list>
          </div>
          <ion-note class="page-hint">Đặt chỉ tiêu tháng để theo dõi ở trang Dự báo doanh thu</ion-note>
        }
      </div>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="openAdd()"><ion-icon name="add-outline" /></ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 4px; }
  `],
})
export class CrmQuotaPage implements OnInit {
  private service = inject(CrmDealsService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly items = signal<CrmQuota[]>([]);
  readonly loading = signal(true);

  constructor() {
    addIcons({ addOutline, speedometerOutline, trashOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.service.listQuotas());
    } catch (e: any) {
      console.error('load quotas failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  private currentPeriod(): string {
    return new Date().toISOString().slice(0, 7);
  }

  async openAdd() {
    const alert = await this.alertCtrl.create({
      header: 'Đặt chỉ tiêu',
      inputs: [
        { name: 'period', type: 'text', placeholder: 'Kỳ (YYYY-MM)', value: this.currentPeriod() },
        { name: 'target', type: 'number', placeholder: 'Mục tiêu (₫)', value: '0' },
        { name: 'note', type: 'text', placeholder: 'Ghi chú' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Lưu',
          handler: async (data) => {
            const period = String(data?.period ?? '').trim();
            if (!/^\d{4}-\d{2}$/.test(period)) {
              this.toast('Kỳ phải có dạng YYYY-MM', 'danger');
              return false;
            }
            try {
              await this.service.setQuota(period, Number(data.target ?? 0), data.note?.trim() || null);
              this.toast('Đã lưu chỉ tiêu');
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Lưu thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async openEdit(q: CrmQuota) {
    const alert = await this.alertCtrl.create({
      header: `Sửa chỉ tiêu ${q.period}`,
      inputs: [
        { name: 'target', type: 'number', value: String(q.target_amount ?? 0) },
        { name: 'note', type: 'text', value: q.note ?? '' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: async () => {
            try {
              await this.service.removeQuota(q.id);
              this.toast('Đã xóa');
              await this.load();
            } catch (e: any) {
              this.toast(e?.message ?? 'Xóa thất bại', 'danger');
            }
            return true;
          },
        },
        {
          text: 'Lưu',
          handler: async (data) => {
            try {
              await this.service.setQuota(q.period, Number(data.target ?? 0), data.note?.trim() || null);
              this.toast('Đã lưu');
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Lưu thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

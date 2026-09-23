import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonSearchbar,
  IonFab, IonFabButton, IonRefresher, IonRefresherContent,
  AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, storefrontOutline, trashOutline } from 'ionicons/icons';
import { SalesChannelsService, SalesChannel } from '../../core/services/sales-channels.service';

@Component({
  selector: 'app-sales-channels',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonSearchbar,
    IonFab, IonFabButton, IonRefresher, IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /></ion-buttons>
        <ion-title>Kênh bán hàng</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar placeholder="Tìm kênh" [debounce]="300" (ionInput)="onSearch($any($event))" />
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
            <div><ion-icon name="storefront-outline" /></div>
            Chưa có kênh bán hàng. Nhấn + để thêm kênh.
          </div>
        } @else {
          <div class="app-card">
            <ion-list lines="full">
              @for (ch of items(); track ch.id) {
                <ion-item button (click)="openEdit(ch)" detail="false">
                  <ion-icon slot="start" name="storefront-outline" color="primary" />
                  <ion-label>
                    <h3>{{ ch.name }}</h3>
                    <p>{{ service.typeLabel(ch.type) }} · phí {{ ch.fee_percent }}%</p>
                  </ion-label>
                  @if (revenue()[ch.id]; as r) {
                    <ion-badge slot="end" color="tertiary">{{ r.orders }} đơn</ion-badge>
                    <ion-badge slot="end" color="success">{{ formatMoney(r.total) }}</ion-badge>
                  } @else {
                    <ion-badge slot="end" color="medium">0 đơn</ion-badge>
                  }
                </ion-item>
              }
            </ion-list>
          </div>
          <ion-note class="page-hint">Doanh thu tính từ các đơn hàng đã gán kênh</ion-note>
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
export class SalesChannelsPage implements OnInit {
  readonly service = inject(SalesChannelsService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly items = signal<SalesChannel[]>([]);
  readonly revenue = signal<Record<string, { orders: number; total: number }>>({});
  readonly loading = signal(true);
  search = '';

  constructor() {
    addIcons({ addOutline, storefrontOutline, trashOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const [channels, revenue] = await Promise.all([
        this.service.list(this.search),
        this.service.revenueByChannel(),
      ]);
      this.items.set(channels);
      this.revenue.set(revenue);
    } catch (e: any) {
      console.error('load sales channels failed', e);
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

  async openAdd() {
    const alert = await this.alertCtrl.create({
      header: 'Thêm kênh bán hàng',
      inputs: [
        { name: 'name', type: 'text', placeholder: 'Tên kênh (VD: Shopee)' },
        {
          name: 'type',
          type: 'radio',
          label: 'Bán trực tiếp',
          value: 'direct',
          checked: true,
        },
        { name: 'type', type: 'radio', label: 'Online / Website', value: 'online' },
        { name: 'type', type: 'radio', label: 'Sàn TMĐT', value: 'marketplace' },
        { name: 'type', type: 'radio', label: 'Đại lý', value: 'agent' },
        { name: 'type', type: 'radio', label: 'Khác', value: 'other' },
        { name: 'fee', type: 'number', placeholder: 'Phí sàn (%)', value: '0' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Thêm',
          handler: async (data) => {
            if (!data?.name?.trim()) {
              this.toast('Vui lòng nhập tên kênh', 'danger');
              return false;
            }
            try {
              await this.service.create({
                name: data.name.trim(),
                type: data.type ?? 'direct',
                fee_percent: Number(data.fee ?? 0),
                active: true,
              });
              this.toast('Đã thêm kênh');
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Thêm thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async openEdit(ch: SalesChannel) {
    const alert = await this.alertCtrl.create({
      header: 'Sửa kênh',
      inputs: [
        { name: 'name', type: 'text', value: ch.name },
        { name: 'fee', type: 'number', value: String(ch.fee_percent ?? 0), placeholder: 'Phí sàn (%)' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: async () => {
            try {
              await this.service.remove(ch.id);
              this.toast('Đã xóa kênh');
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
            if (!data?.name?.trim()) {
              this.toast('Tên không được trống', 'danger');
              return false;
            }
            try {
              await this.service.update(ch.id, {
                name: data.name.trim(),
                fee_percent: Number(data.fee ?? 0),
              });
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

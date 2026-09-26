import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonButton, IonSearchbar,
  IonFab, IonFabButton, IonRefresher, IonRefresherContent, IonSegment, IonSegmentButton,
  AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline, carOutline, createOutline, trashOutline, checkmarkCircleOutline,
  informationCircleOutline, pricetagOutline, warningOutline,
} from 'ionicons/icons';
import { ShippingPartnersService, ShippingPartner } from '../../core/services/shipping-partners.service';
import { SHIPPING_CARRIERS, SHIPPING_ZONES, calcShippingFee } from '../../core/shipping';

/**
 * Đối tác vận chuyển: CRUD đối tác, đặt mặc định, xem bảng giá tham khảo
 * theo vùng (nội thành / ngoại thành / liên tỉnh) tính từ cấu hình chiết khấu.
 */
@Component({
  selector: 'app-shipping-partners',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonButton,
    IonSearchbar, IonFab, IonFabButton, IonRefresher, IonRefresherContent,
    IonSegment, IonSegmentButton,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /><ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons>
        <ion-title>Đối tác vận chuyển</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="tab()" (ionChange)="tab.set($any($event.detail.value))">
          <ion-segment-button value="partners"><ion-label>Đối tác</ion-label></ion-segment-button>
          <ion-segment-button value="fees"><ion-label>Bảng giá</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
      @if (tab() === 'partners') {
        <ion-toolbar>
          <ion-searchbar placeholder="Tìm đối tác" [debounce]="300" (ionInput)="onSearch($any($event))" />
        </ion-toolbar>
      }
    </ion-header>

    <ion-content class="app-page">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($any($event))">
        <ion-refresher-content />
      </ion-refresher>
      <div class="app-page-container">
        @if (migrationNeeded()) {
          <div class="app-banner-warning">
            <ion-icon name="warning-outline" />
            <span>Cần chạy migration v14 trong Supabase để bật module này.</span>
          </div>
        }
        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else if (tab() === 'partners') {
          @if (items().length === 0) {
            <div class="app-empty">
              <div><ion-icon name="car-outline" /></div>
              Chưa có đối tác vận chuyển. Nhấn + để thêm.
            </div>
          } @else {
            <div class="app-card">
              <ion-list lines="full">
                @for (p of items(); track p.id) {
                  <ion-item button (click)="openEdit(p)" detail="false">
                    <ion-icon slot="start" name="car-outline" color="primary" />
                    <ion-label>
                      <h3>
                        {{ p.name }}
                        @if (p.is_default) { <ion-icon name="checkmark-circle-outline" color="success" /> }
                      </h3>
                      <p>{{ p.phone ?? '—' }} · Chiết khấu {{ p.fee_percent }}%</p>
                    </ion-label>
                    @if (!p.active) { <ion-badge slot="end" color="medium">Tạm dừng</ion-badge> }
                  </ion-item>
                }
              </ion-list>
            </div>
            <ion-note class="page-hint">Nhấn đối tác để sửa / đặt mặc định / xóa.</ion-note>
          }
        } @else {
          <div class="app-banner-warning">
            <ion-icon name="information-circle-outline" />
            <span>Bảng giá tham khảo tính theo cân nặng & vùng giao. Mỗi đối tác có chiết khấu riêng.</span>
          </div>
          @for (p of items(); track p.id) {
            <div class="app-card">
              <div class="app-card-title">
                <h4>{{ p.name }}</h4>
                <ion-badge color="primary">{{ p.fee_percent }}%</ion-badge>
              </div>
              <ion-list lines="full">
                @for (z of zones; track z.key) {
                  <ion-item>
                    <ion-icon slot="start" name="pricetag-outline" color="medium" />
                    <ion-label>{{ z.label }}</ion-label>
                    <ion-note slot="end">{{ feeFor(p.fee_percent, z.key) | number }} ₫</ion-note>
                  </ion-item>
                }
              </ion-list>
            </div>
          }
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
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); display: flex; align-items: center; gap: 4px; }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 4px; }
  `],
})
export class ShippingPartnersPage implements OnInit {
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  private service = inject(ShippingPartnersService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly items = signal<ShippingPartner[]>([]);
  readonly loading = signal(true);
  readonly migrationNeeded = signal(false);
  readonly tab = signal<'partners' | 'fees'>('partners');
  readonly zones = SHIPPING_ZONES;
  readonly carriers = SHIPPING_CARRIERS;
  search = '';

  constructor() {
    addIcons({
      addOutline, carOutline, createOutline, trashOutline, checkmarkCircleOutline,
      informationCircleOutline, pricetagOutline, warningOutline,
    });
  }

  ngOnInit(): void {
    this.load();
  }

  feeFor(percent: number, zoneKey: string): number {
    return calcShippingFee(1, zoneKey, percent);
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.service.list(this.search));
      this.migrationNeeded.set(this.service.migrationNeeded());
    } catch (e: any) {
      console.error('load shipping partners failed', e);
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

  private fields(p?: ShippingPartner) {
    return [
      { name: 'name', type: 'text' as const, placeholder: 'Tên đối tác', value: p?.name ?? '' },
      { name: 'phone', type: 'tel' as const, placeholder: 'SĐT liên hệ', value: p?.phone ?? '' },
      { name: 'fee_percent', type: 'number' as const, placeholder: 'Chiết khấu %', value: String(p?.fee_percent ?? 0) },
      { name: 'api_endpoint', type: 'text' as const, placeholder: 'API endpoint (tùy chọn)', value: p?.api_endpoint ?? '' },
      { name: 'api_token', type: 'password' as const, placeholder: 'API token (tùy chọn)', value: p?.api_token ?? '' },
      { name: 'note', type: 'text' as const, placeholder: 'Ghi chú', value: p?.note ?? '' },
    ];
  }

  private parse(data: any) {
    return {
      name: data?.name?.trim(),
      phone: data?.phone?.trim() || null,
      fee_percent: Number(data?.fee_percent ?? 0),
      api_endpoint: data?.api_endpoint?.trim() || null,
      api_token: data?.api_token?.trim() || null,
      note: data?.note?.trim() || null,
    };
  }

  async openAdd() {
    const alert = await this.alertCtrl.create({
      header: 'Thêm đối tác vận chuyển',
      inputs: this.fields(),
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Thêm',
          handler: async (data) => {
            if (!data?.name?.trim()) {
              this.toast('Vui lòng nhập tên đối tác', 'danger');
              return false;
            }
            try {
              await this.service.create({ ...this.parse(data), active: true, is_default: this.items().length === 0 });
              this.toast('Đã thêm đối tác');
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

  async openEdit(p: ShippingPartner) {
    const alert = await this.alertCtrl.create({
      header: 'Sửa đối tác',
      inputs: this.fields(p),
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: async () => {
            try {
              await this.service.remove(p.id);
              this.toast('Đã xóa đối tác');
              await this.load();
            } catch (e: any) {
              this.toast(e?.message ?? 'Xóa thất bại', 'danger');
            }
            return true;
          },
        },
        {
          text: p.is_default ? 'Bỏ mặc định' : 'Đặt mặc định',
          handler: async () => {
            try {
              if (p.is_default) {
                await this.service.update(p.id, { is_default: false });
                this.toast('Đã bỏ mặc định');
              } else {
                await this.service.setDefault(p.id);
                this.toast('Đã đặt mặc định');
              }
              await this.load();
            } catch (e: any) {
              this.toast(e?.message ?? 'Thao tác thất bại', 'danger');
            }
            return false;
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
              await this.service.update(p.id, this.parse(data));
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

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonButton,
  IonRefresher, IonRefresherContent, AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline, rocketOutline, businessOutline, sparklesOutline } from 'ionicons/icons';
import { UpgradeRequestsService, UpgradeRequest, PLANS } from '../../core/services/upgrade-requests.service';

@Component({
  selector: 'app-pricing',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonButton,
    IonRefresher, IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /><ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons>
        <ion-title>Nâng cấp gói</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($any($event))">
        <ion-refresher-content />
      </ion-refresher>
      <div class="app-page-container">
        <div class="plan-grid">
          @for (p of plans; track p.value) {
            <div class="app-card plan" [class.featured]="p.value === 'pro'">
              @if (p.value === 'pro') {
                <ion-badge color="warning" class="featured-badge">
                  <ion-icon name="sparkles-outline" /> Phổ biến
                </ion-badge>
              }
              <h3>{{ p.label }}</h3>
              <div class="price">{{ p.price === 0 ? 'Miễn phí' : formatMoney(p.price) + '/tháng' }}</div>
              <ul>
                @for (f of p.features; track f) {
                  <li><ion-icon name="checkmark-circle-outline" color="success" /> {{ f }}</li>
                }
              </ul>
              <ion-button expand="block" [fill]="p.value === 'pro' ? 'solid' : 'outline'" (click)="requestUpgrade(p.value)">
                Chọn gói {{ p.label }}
              </ion-button>
            </div>
          }
        </div>

        <div class="app-card">
          <h4 class="section-title"><ion-icon name="rocket-outline" /> Yêu cầu đã gửi</h4>
          @if (loading()) {
            <div class="page-loading"><ion-spinner name="crescent" /></div>
          } @else if (requests().length === 0) {
            <ion-note>Bạn chưa gửi yêu cầu nâng cấp nào.</ion-note>
          } @else {
            <ion-list lines="full">
              @for (r of requests(); track r.id) {
                <ion-item>
                  <ion-icon slot="start" name="business-outline" color="primary" />
                  <ion-label>
                    <h3>{{ service.planLabel(r.plan) }}</h3>
                    <p>{{ r.contact_name ?? '—' }} · {{ r.contact_phone ?? '—' }}</p>
                    <p>{{ r.created_at | date: 'dd/MM/yyyy HH:mm' }}</p>
                  </ion-label>
                  <ion-badge slot="end" [color]="statusColor(r.status)">{{ statusLabel(r.status) }}</ion-badge>
                </ion-item>
              }
            </ion-list>
          }
        </div>

        <ion-note class="page-hint">
          Gửi yêu cầu để đội ngũ liên hệ kích hoạt gói. Thanh toán trực tuyến sẽ bổ sung sau.
        </ion-note>
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 24px 0; }
    .plan-grid { display: grid; gap: 14px; }
    .plan { position: relative; display: flex; flex-direction: column; gap: 8px; }
    .plan.featured { border: 1.5px solid var(--ion-color-warning); }
    .featured-badge { position: absolute; top: -12px; right: 12px; display: inline-flex; align-items: center; gap: 4px; }
    .plan h3 { margin: 4px 0 0; font-size: 16px; font-weight: 700; color: var(--app-text); }
    .price { font-size: 20px; font-weight: 700; color: var(--ion-color-primary); }
    .plan ul { list-style: none; padding: 0; margin: 4px 0 10px; display: flex; flex-direction: column; gap: 6px; }
    .plan li { display: flex; align-items: center; gap: 6px; font-size: 13.5px; color: var(--app-text); }
    .section-title { display: flex; align-items: center; gap: 6px; margin: 0 0 10px; font-size: 14px; font-weight: 700; color: var(--app-text); }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 10px 4px; }
  `],
})
export class PricingPage implements OnInit {
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  readonly service = inject(UpgradeRequestsService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly plans = PLANS;
  readonly requests = signal<UpgradeRequest[]>([]);
  readonly loading = signal(true);

  constructor() {
    addIcons({ checkmarkCircleOutline, rocketOutline, businessOutline, sparklesOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.requests.set(await this.service.list());
    } catch (e: any) {
      console.error('load upgrade requests failed', e);
      this.requests.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  statusLabel(status: string): string {
    return { pending: 'Chờ xử lý', contacted: 'Đã liên hệ', done: 'Hoàn tất', cancelled: 'Đã hủy' }[status] ?? status;
  }

  statusColor(status: string): string {
    return { pending: 'warning', contacted: 'primary', done: 'success', cancelled: 'medium' }[status] ?? 'medium';
  }

  formatMoney(v: number): string {
    return new Intl.NumberFormat('vi-VN').format(v) + ' ₫';
  }

  async requestUpgrade(plan: string) {
    const alert = await this.alertCtrl.create({
      header: `Nâng cấp: ${this.service.planLabel(plan)}`,
      inputs: [
        { name: 'contact_name', type: 'text', placeholder: 'Tên người liên hệ' },
        { name: 'contact_phone', type: 'text', placeholder: 'Số điện thoại' },
        { name: 'note', type: 'text', placeholder: 'Ghi chú (nhu cầu của bạn)' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Gửi yêu cầu',
          handler: async (data) => {
            if (!data?.contact_phone?.trim()) {
              this.toast('Vui lòng nhập số điện thoại', 'danger');
              return false;
            }
            try {
              await this.service.create({
                plan,
                contact_name: data.contact_name?.trim() || '',
                contact_phone: data.contact_phone.trim(),
                note: data.note?.trim() || null,
              });
              this.toast('Đã gửi yêu cầu nâng cấp');
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Gửi thất bại', 'danger');
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

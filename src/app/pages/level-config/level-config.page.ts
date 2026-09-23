import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonButton, IonRefresher,
  IonRefresherContent, AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline, medalOutline, trashOutline, trophyOutline, informationCircleOutline,
  trendingUpOutline, warningOutline,
} from 'ionicons/icons';
import { LoyaltyConfigService } from '../../core/services/loyalty-config.service';
import { LoyaltyTierRule, DEFAULT_TIERS } from '../../core/loyalty';

/**
 * Cấu hình thăng hạng (khớp /level-config của mẫu): định nghĩa các hạng
 * thành viên theo mức chi tiêu + điểm, kèm chiết khấu mặc định.
 */
@Component({
  selector: 'app-level-config',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonButton,
    IonRefresher, IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/point-config" /><ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons>
        <ion-title>Cấu hình thăng hạng</ion-title>
      </ion-toolbar>
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
        <div class="app-banner-warning">
          <ion-icon name="information-circle-outline" />
          <span>Khách được xét lên hạng khi đạt ĐỒNG THỜI mức chi tiêu và số điểm tối thiểu.</span>
        </div>

        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else {
          @if (tiers().length === 0) {
            <div class="app-empty">
              <div><ion-icon name="medal-outline" /></div>
              Chưa có cấu hình hạng. Nhấn nút bên dưới để tạo bộ hạng mặc định.
            </div>
            <ion-button expand="block" (click)="seedDefaults()">
              <ion-icon slot="start" name="add-outline" /> Tạo bộ hạng mặc định (4 hạng)
            </ion-button>
          } @else {
            @for (t of tiers(); track t.id) {
              <div class="app-card">
                <div class="app-card-title">
                  <h4><ion-icon name="trophy-outline" [color]="colorFor(t.tier)" /> {{ t.name }}</h4>
                  <ion-badge [color]="colorFor(t.tier)">-{{ t.discount_percent }}%</ion-badge>
                </div>
                <ion-list lines="full">
                  <ion-item>
                    <ion-icon slot="start" name="trending-up-outline" color="medium" />
                    <ion-label>Chi tiêu tối thiểu</ion-label>
                    <ion-note slot="end">{{ t.min_spend | number }} ₫</ion-note>
                  </ion-item>
                  <ion-item>
                    <ion-icon slot="start" name="medal-outline" color="medium" />
                    <ion-label>Điểm tối thiểu</ion-label>
                    <ion-note slot="end">{{ t.min_points | number }} điểm</ion-note>
                  </ion-item>
                </ion-list>
                <div class="row-actions">
                  <ion-button size="small" fill="clear" (click)="openEdit(t)">
                    <ion-icon slot="start" name="medal-outline" /> Sửa
                  </ion-button>
                  <ion-button size="small" fill="clear" color="danger" (click)="remove(t)">
                    <ion-icon slot="start" name="trash-outline" /> Xóa
                  </ion-button>
                </div>
              </div>
            }
            <ion-button expand="block" (click)="openEdit()">
              <ion-icon slot="start" name="add-outline" /> Thêm hạng
            </ion-button>
          }
          <ion-note class="page-hint">
            Hạng hiện tại của khách được xác định tự động từ tổng chi tiêu và điểm tích lũy.
          </ion-note>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    .app-card-title h4 { display: flex; align-items: center; gap: 6px; }
    .row-actions { display: flex; gap: 4px; justify-content: flex-end; margin-top: 4px; }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 10px 4px; }
  `],
})
export class LevelConfigPage implements OnInit {
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  private service = inject(LoyaltyConfigService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly tiers = signal<LoyaltyTierRule[]>([]);
  readonly loading = signal(true);
  readonly migrationNeeded = signal(false);

  constructor() {
    addIcons({
      addOutline, medalOutline, trashOutline, trophyOutline, informationCircleOutline,
      trendingUpOutline, warningOutline,
    });
  }

  ngOnInit(): void {
    this.load();
  }

  colorFor(tier: string): string {
    const map: Record<string, string> = {
      bronze: 'warning', silver: 'medium', gold: 'warning', platinum: 'primary',
    };
    return map[tier] ?? 'primary';
  }

  async load() {
    this.loading.set(true);
    try {
      this.tiers.set(await this.service.listTiers());
      this.migrationNeeded.set(this.service.migrationNeeded());
    } catch (e: any) {
      console.error('load tiers failed', e);
      this.tiers.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  async seedDefaults() {
    try {
      for (const t of DEFAULT_TIERS) {
        await this.service.saveTier(t);
      }
      this.toast('Đã tạo bộ hạng mặc định');
      await this.load();
    } catch (e: any) {
      this.toast(e?.message ?? 'Tạo thất bại', 'danger');
    }
  }

  private fields(t?: LoyaltyTierRule) {
    return [
      { name: 'name', type: 'text' as const, placeholder: 'Tên hạng (VD: Vàng)', value: t?.name ?? '' },
      { name: 'tier', type: 'text' as const, placeholder: 'Mã hạng (bronze/silver/gold/platinum)', value: t?.tier ?? 'bronze' },
      { name: 'min_spend', type: 'number' as const, placeholder: 'Chi tiêu tối thiểu (₫)', value: String(t?.min_spend ?? 0) },
      { name: 'min_points', type: 'number' as const, placeholder: 'Điểm tối thiểu', value: String(t?.min_points ?? 0) },
      { name: 'discount_percent', type: 'number' as const, placeholder: 'Chiết khấu %', value: String(t?.discount_percent ?? 0) },
    ];
  }

  async openEdit(t?: LoyaltyTierRule) {
    const alert = await this.alertCtrl.create({
      header: t ? 'Sửa hạng' : 'Thêm hạng',
      inputs: this.fields(t),
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Lưu',
          handler: async (data) => {
            if (!data?.name?.trim()) {
              this.toast('Vui lòng nhập tên hạng', 'danger');
              return false;
            }
            try {
              await this.service.saveTier({
                id: t?.id,
                name: data.name.trim(),
                tier: (data.tier?.trim() || 'bronze').toLowerCase(),
                min_spend: Number(data.min_spend ?? 0),
                min_points: Number(data.min_points ?? 0),
                discount_percent: Number(data.discount_percent ?? 0),
                active: true,
                sort_order: t?.sort_order ?? this.tiers().length + 1,
              });
              this.toast('Đã lưu hạng');
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

  async remove(t: LoyaltyTierRule) {
    if (!t.id) return;
    try {
      await this.service.removeTier(t.id);
      this.toast('Đã xóa hạng');
      await this.load();
    } catch (e: any) {
      this.toast(e?.message ?? 'Xóa thất bại', 'danger');
    }
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

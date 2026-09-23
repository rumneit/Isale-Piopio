import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonButton, IonSegment,
  IonSegmentButton, IonToggle, IonInput, IonRefresher, IonRefresherContent,
  AlertController, ToastController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  addOutline, createOutline, trashOutline, medalOutline, sparklesOutline,
  cardOutline, timeOutline, saveOutline, informationCircleOutline, chevronForwardOutline,
  warningOutline,
} from 'ionicons/icons';
import { LoyaltyConfigService } from '../../core/services/loyalty-config.service';
import { PointConfigRule, LoyaltyTierRule, DEFAULT_TIERS, pickPointRule } from '../../core/loyalty';
import { SettingsService } from '../../core/services/settings.service';

/**
 * Tích điểm & thăng hạng (khớp /point-config của mẫu):
 *  - Lịch sử tích điểm
 *  - Cấu hình thanh toán (đổi điểm khi thanh toán)
 *  - Cấu hình tích điểm (quy tắc theo hạng khách)
 *  - Cấu hình thăng hạng
 */
@Component({
  selector: 'app-point-config',
  imports: [
    CommonModule, FormsModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
    IonIcon, IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote,
    IonButton, IonSegment, IonSegmentButton, IonToggle, IonInput, IonRefresher,
    IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /></ion-buttons>
        <ion-title>Tích điểm</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="tab()" (ionChange)="tab.set($any($event.detail.value))" scrollable>
          <ion-segment-button value="history"><ion-label>Lịch sử</ion-label></ion-segment-button>
          <ion-segment-button value="payment"><ion-label>Thanh toán</ion-label></ion-segment-button>
          <ion-segment-button value="rules"><ion-label>Tích điểm</ion-label></ion-segment-button>
          <ion-segment-button value="tiers"><ion-label>Thăng hạng</ion-label></ion-segment-button>
        </ion-segment>
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
        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else if (tab() === 'history') {
          @if (history().length === 0) {
            <div class="app-empty">
              <div><ion-icon name="time-outline" /></div>
              Chưa có giao dịch tích điểm.
            </div>
          } @else {
            <div class="app-card">
              <ion-list lines="full">
                @for (h of history(); track h['id']) {
                  <ion-item>
                    <ion-icon slot="start" name="sparkles-outline"
                              [color]="h['points'] > 0 ? 'success' : 'danger'" />
                    <ion-label>
                      <h3>{{ h['note'] ?? 'Điểm' }}</h3>
                      <p>{{ h['created_at'] | date:'dd/MM/yyyy HH:mm' }}</p>
                    </ion-label>
                    <ion-badge slot="end" [color]="h['points'] > 0 ? 'success' : 'danger'">
                      {{ h['points'] > 0 ? '+' : '' }}{{ h['points'] }}
                    </ion-badge>
                  </ion-item>
                }
              </ion-list>
            </div>
          }
        } @else if (tab() === 'payment') {
          <div class="app-card">
            <div class="app-card-title"><h4>Cấu hình thanh toán bằng điểm</h4></div>
            <ion-list lines="full">
              <ion-item>
                <ion-icon slot="start" name="card-outline" color="primary" />
                <ion-label>
                  <h3>Cho phép đổi điểm khi thanh toán</h3>
                  <p>Khách dùng điểm để trừ tiền đơn hàng.</p>
                </ion-label>
                <ion-toggle slot="end" [(ngModel)]="redeemEnabled" />
              </ion-item>
              <ion-item>
                <ion-input type="number" label="Số điểm tối thiểu để đổi" labelPlacement="stacked"
                           [(ngModel)]="minRedeem" />
              </ion-item>
              <ion-item>
                <ion-input type="number" label="Tối đa % giá trị đơn được trừ" labelPlacement="stacked"
                           [(ngModel)]="maxRedeemPercent" />
              </ion-item>
            </ion-list>
          </div>
          <ion-button expand="block" (click)="savePayment()">
            <ion-icon slot="start" name="save-outline" /> Lưu cấu hình thanh toán
          </ion-button>
        } @else if (tab() === 'rules') {
          @if (rules().length === 0) {
            <div class="app-empty">
              <div><ion-icon name="sparkles-outline" /></div>
              Chưa có quy tắc tích điểm. Nhấn + để thêm.
            </div>
          } @else {
            <div class="app-card">
              <ion-list lines="full">
                @for (r of rules(); track r.id) {
                  <ion-item button (click)="openRule(r)" detail="false">
                    <ion-icon slot="start" name="sparkles-outline" color="primary" />
                    <ion-label>
                      <h3>{{ r.name }}</h3>
                      <p>{{ r.spend_per_point | number }} ₫ = 1 điểm · đổi {{ r.redeem_value | number }} ₫</p>
                    </ion-label>
                    <ion-badge slot="end" color="medium">{{ tierLabel(r.tier) }}</ion-badge>
                  </ion-item>
                }
              </ion-list>
            </div>
          }
          <ion-button expand="block" (click)="openRule()">
            <ion-icon slot="start" name="add-outline" /> Thêm quy tắc tích điểm
          </ion-button>
          <ion-note class="page-hint">
            Quy tắc "Tất cả hạng" áp dụng khi hạng của khách chưa có quy tắc riêng.
          </ion-note>
        } @else {
          <ion-button expand="block" fill="outline" (click)="goLevelConfig()">
            <ion-icon slot="start" name="medal-outline" /> Mở trang cấu hình thăng hạng
            <ion-icon slot="end" name="chevron-forward-outline" />
          </ion-button>
          <div class="app-card">
            <div class="app-card-title"><h4>Hạng thành viên</h4></div>
            <ion-list lines="full">
              @for (t of tiers(); track t.id) {
                <ion-item>
                  <ion-icon slot="start" name="medal-outline" color="warning" />
                  <ion-label>
                    <h3>{{ t.name }}</h3>
                    <p>Từ {{ t.min_spend | number }} ₫ · {{ t.min_points }} điểm</p>
                  </ion-label>
                  <ion-badge slot="end" color="success">-{{ t.discount_percent }}%</ion-badge>
                </ion-item>
              } @empty {
                <ion-item><ion-label>Chưa có hạng. Dùng nút phía trên để cấu hình.</ion-label></ion-item>
              }
            </ion-list>
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 10px 4px; }
  `],
})
export class PointConfigPage implements OnInit {
  private service = inject(LoyaltyConfigService);
  private settings = inject(SettingsService);
  private router = inject(Router);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly tab = signal<'history' | 'payment' | 'rules' | 'tiers'>('history');
  readonly history = signal<Array<Record<string, any>>>([]);
  readonly rules = signal<PointConfigRule[]>([]);
  readonly tiers = signal<LoyaltyTierRule[]>([]);
  readonly loading = signal(true);
  readonly migrationNeeded = signal(false);

  redeemEnabled = true;
  minRedeem: number | null = 100;
  maxRedeemPercent: number | null = 50;

  constructor() {
    addIcons({
      addOutline, createOutline, trashOutline, medalOutline, sparklesOutline,
      cardOutline, timeOutline, saveOutline, informationCircleOutline, chevronForwardOutline,
      warningOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    await this.settings.load();
    this.redeemEnabled = this.settings.get('point_redeem_enabled') !== 'false';
    this.minRedeem = this.settings.numberValue('point_min_redeem', 100);
    this.maxRedeemPercent = this.settings.numberValue('point_max_redeem_percent', 50);
    await this.load();
  }

  tierLabel(tier: string): string {
    const map: Record<string, string> = {
      all: 'Tất cả hạng', bronze: 'Đồng', silver: 'Bạc', gold: 'Vàng', platinum: 'Kim cương',
    };
    return map[tier] ?? tier;
  }

  async load() {
    this.loading.set(true);
    try {
      const [history, rules, tiers] = await Promise.all([
        this.service.recentTransactions(),
        this.service.listPointRules(),
        this.service.listTiers(),
      ]);
      this.history.set(history);
      this.rules.set(rules);
      this.tiers.set(tiers);
      this.migrationNeeded.set(this.service.migrationNeeded());
    } catch (e: any) {
      console.error('load loyalty config failed', e);
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  goLevelConfig() {
    this.router.navigateByUrl('/level-config');
  }

  async savePayment() {
    try {
      await this.settings.set('point_redeem_enabled', String(!!this.redeemEnabled));
      await this.settings.set('point_min_redeem', String(Number(this.minRedeem ?? 0)));
      await this.settings.set('point_max_redeem_percent', String(Number(this.maxRedeemPercent ?? 0)));
      this.toast('Đã lưu cấu hình thanh toán');
    } catch (e: any) {
      this.toast(e?.message ?? 'Lưu thất bại', 'danger');
    }
  }

  private ruleFields(r?: PointConfigRule) {
    return [
      { name: 'name', type: 'text' as const, placeholder: 'Tên quy tắc', value: r?.name ?? '' },
      { name: 'spend_per_point', type: 'number' as const, placeholder: 'Chi tiêu để được 1 điểm (₫)', value: String(r?.spend_per_point ?? 10000) },
      { name: 'redeem_value', type: 'number' as const, placeholder: '1 điểm đổi được (₫)', value: String(r?.redeem_value ?? 1000) },
      { name: 'min_order_total', type: 'number' as const, placeholder: 'Đơn tối thiểu để tích (₫)', value: String(r?.min_order_total ?? 0) },
    ];
  }

  private ruleParse(data: any) {
    return {
      name: data?.name?.trim(),
      spend_per_point: Number(data?.spend_per_point ?? 0),
      redeem_value: Number(data?.redeem_value ?? 0),
      min_order_total: Number(data?.min_order_total ?? 0),
    };
  }

  async openRule(r?: PointConfigRule) {
    const alert = await this.alertCtrl.create({
      header: r ? 'Sửa quy tắc tích điểm' : 'Thêm quy tắc tích điểm',
      inputs: this.ruleFields(r),
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        ...(r
          ? [{
              text: 'Xóa',
              role: 'destructive' as const,
              handler: async () => {
                try {
                  await this.service.removePointRule(r.id!);
                  this.toast('Đã xóa quy tắc');
                  await this.load();
                } catch (e: any) {
                  this.toast(e?.message ?? 'Xóa thất bại', 'danger');
                }
                return true;
              },
            }]
          : []),
        {
          text: 'Lưu',
          handler: async (data) => {
            if (!data?.name?.trim()) {
              this.toast('Vui lòng nhập tên quy tắc', 'danger');
              return false;
            }
            const parsed = this.ruleParse(data);
            if (parsed.spend_per_point <= 0) {
              this.toast('Chi tiêu để được 1 điểm phải lớn hơn 0', 'danger');
              return false;
            }
            try {
              await this.service.savePointRule({ ...parsed, tier: r?.tier ?? 'all', active: true, id: r?.id });
              this.toast('Đã lưu quy tắc');
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

  /** Gợi ý dùng cho test/khởi tạo: quy tắc đang áp dụng cho một hạng. */
  ruleFor(tier: string): PointConfigRule {
    return pickPointRule(this.rules(), tier);
  }

  static defaultTiers = DEFAULT_TIERS;

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonButton,
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonSpinner, IonNote, IonBadge, IonRefresher, IonRefresherContent,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { trendingUpOutline, speedometerOutline, calendarOutline } from 'ionicons/icons';
import { CrmDealsService, CrmDeal, CrmQuota } from '../../core/services/crm-deals.service';

@Component({
  selector: 'app-crm-forecast',
  imports: [
    IonButton,
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonSpinner, IonNote, IonBadge, IonRefresher, IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/crm" /><ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons>
        <ion-title>Dự báo doanh thu</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($any($event))">
        <ion-refresher-content />
      </ion-refresher>
      <div class="app-page-container">
        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else {
          <div class="app-card">
            <h4 class="section-title"><ion-icon name="trending-up-outline" /> Tổng quan pipeline</h4>
            <div class="kpi-grid">
              <div class="kpi">
                <span>Tổng giá trị</span>
                <strong>{{ formatMoney(totalValue()) }}</strong>
              </div>
              <div class="kpi">
                <span>Dự báo có trọng số</span>
                <strong class="primary">{{ formatMoney(forecast()) }}</strong>
              </div>
              <div class="kpi">
                <span>Đã thắng</span>
                <strong class="success">{{ formatMoney(wonValue()) }}</strong>
              </div>
              <div class="kpi">
                <span>Đang mở</span>
                <strong>{{ openCount() }} cơ hội</strong>
              </div>
            </div>
          </div>

          @if (quota(); as q) {
            <div class="app-card">
              <h4 class="section-title"><ion-icon name="speedometer-outline" /> Chỉ tiêu kỳ {{ q.period }}</h4>
              <div class="progress-wrap">
                <div class="progress-bar">
                  <div class="progress-fill" [style.width.%]="quotaPercent(q)"></div>
                </div>
                <div class="progress-meta">
                  <span>{{ formatMoney(wonValue()) }} / {{ formatMoney(q.target_amount) }}</span>
                  <ion-badge [color]="quotaPercent(q) >= 100 ? 'success' : 'primary'">{{ quotaPercent(q) }}%</ion-badge>
                </div>
              </div>
            </div>
          }

          <div class="app-card">
            <h4 class="section-title"><ion-icon name="calendar-outline" /> Dự báo theo giai đoạn</h4>
            @for (s of pipeline(); track s.stage) {
              <div class="pipe-row">
                <span>{{ service.stageLabel(s.stage) }}</span>
                <span class="muted">{{ s.count }} · {{ formatMoney(s.amount) }}</span>
              </div>
            }
          </div>
          <ion-note class="page-hint">
            Dự báo có trọng số = Σ (giá trị × xác suất), bỏ qua cơ hội đã thất bại
          </ion-note>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .section-title { display: flex; align-items: center; gap: 6px; margin: 0 0 12px; font-size: 14px; font-weight: 700; color: var(--app-text); }
    .kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .kpi { display: flex; flex-direction: column; gap: 2px; }
    .kpi span { font-size: 11.5px; color: var(--app-text-muted); }
    .kpi strong { font-size: 17px; color: var(--app-text); }
    .kpi strong.primary { color: var(--ion-color-primary); }
    .kpi strong.success { color: var(--ion-color-success); }
    .progress-wrap { display: flex; flex-direction: column; gap: 8px; }
    .progress-bar { height: 10px; border-radius: 6px; background: var(--app-surface-alt); overflow: hidden; }
    .progress-fill { height: 100%; background: var(--ion-color-primary); transition: width .3s ease; }
    .progress-meta { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--app-text); }
    .pipe-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13.5px; color: var(--app-text); border-bottom: 1px dashed var(--app-border); }
    .pipe-row:last-child { border-bottom: none; }
    .muted { color: var(--app-text-muted); }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 4px; }
  `],
})
export class CrmForecastPage implements OnInit {
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  readonly service = inject(CrmDealsService);

  readonly deals = signal<CrmDeal[]>([]);
  readonly quotas = signal<CrmQuota[]>([]);
  readonly loading = signal(true);

  readonly totalValue = computed(() => this.deals().reduce((s, d) => s + (Number(d.amount) || 0), 0));
  readonly forecast = computed(() => CrmDealsService.weightedForecast(this.deals()));
  readonly wonValue = computed(() =>
    this.deals().filter((d) => d.stage === 'won').reduce((s, d) => s + (Number(d.amount) || 0), 0)
  );
  readonly openCount = computed(() => this.deals().filter((d) => d.stage !== 'won' && d.stage !== 'lost').length);
  readonly pipeline = computed(() => CrmDealsService.pipelineByStage(this.deals()));

  /** Chỉ tiêu của kỳ hiện tại (YYYY-MM). */
  readonly quota = computed(() => {
    const period = new Date().toISOString().slice(0, 7);
    return this.quotas().find((q) => q.period === period) ?? null;
  });

  constructor() {
    addIcons({ trendingUpOutline, speedometerOutline, calendarOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const [deals, quotas] = await Promise.all([this.service.list(), this.service.listQuotas()]);
      this.deals.set(deals);
      this.quotas.set(quotas);
    } catch (e: any) {
      console.error('load forecast failed', e);
      this.deals.set([]);
      this.quotas.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  quotaPercent(q: CrmQuota): number {
    if (!q.target_amount) return 0;
    return Math.min(999, Math.round((this.wonValue() / q.target_amount) * 100));
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}

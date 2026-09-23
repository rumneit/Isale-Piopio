import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonButton,
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonSpinner, IonNote, IonBadge, IonSegment, IonSegmentButton, IonList, IonItem, IonLabel,
  IonRefresher, IonRefresherContent,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { timeOutline } from 'ionicons/icons';
import { AdvancedReportsService, TimelyReportRow } from '../../core/services/advanced-reports.service';
import { ReportRange } from '../../core/services/reports.service';

@Component({
  selector: 'app-report-timely',
  imports: [
    IonButton,
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonSpinner, IonNote, IonBadge, IonSegment, IonSegmentButton, IonList,
    IonItem, IonLabel, IonRefresher, IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/report" /><ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons>
        <ion-title>Doanh thu theo thời điểm</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="range()" (ionChange)="onRange($any($event.detail.value))">
          <ion-segment-button value="today">Hôm nay</ion-segment-button>
          <ion-segment-button value="week">Tuần</ion-segment-button>
          <ion-segment-button value="month">Tháng</ion-segment-button>
          <ion-segment-button value="year">Năm</ion-segment-button>
        </ion-segment>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="mode()" (ionChange)="onMode($any($event.detail.value))">
          <ion-segment-button value="hour">Theo giờ</ion-segment-button>
          <ion-segment-button value="weekday">Theo thứ</ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($any($event))">
        <ion-refresher-content />
      </ion-refresher>
      <div class="app-page-container">
        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else if (total() === 0) {
          <div class="app-empty">
            <div><ion-icon name="time-outline" /></div>
            Chưa có dữ liệu bán hàng trong kỳ này.
          </div>
        } @else {
          <div class="app-card">
            <div class="totals">
              <div><span class="muted">Tổng doanh thu</span><strong>{{ formatMoney(total()) }}</strong></div>
              <div><span class="muted">Cao nhất</span><strong class="primary">{{ peak()?.bucket }} · {{ formatMoney(peak()?.revenue ?? 0) }}</strong></div>
            </div>
          </div>
          <div class="app-card">
            <ion-list lines="full">
              @for (r of rows(); track r.bucket) {
                <ion-item>
                  <ion-label>
                    <h3>{{ mode() === 'hour' ? r.bucket + 'h' : r.bucket }}</h3>
                    <p>{{ r.orders }} đơn</p>
                    <div class="bar"><div class="fill" [style.width.%]="percent(r)"></div></div>
                  </ion-label>
                  <ion-badge slot="end" color="tertiary">{{ formatMoney(r.revenue) }}</ion-badge>
                </ion-item>
              }
            </ion-list>
          </div>
          <ion-note class="page-hint">Giúp sắp ca làm việc và nhân sự theo khung giờ cao điểm</ion-note>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .totals { display: flex; gap: 28px; flex-wrap: wrap; }
    .totals > div { display: flex; flex-direction: column; }
    .totals strong { font-size: 17px; color: var(--app-text); }
    .totals strong.primary { color: var(--ion-color-primary); }
    .muted { font-size: 11.5px; color: var(--app-text-muted); }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
    .bar { height: 6px; border-radius: 4px; background: var(--app-surface-alt); margin-top: 6px; overflow: hidden; }
    .fill { height: 100%; background: var(--ion-color-tertiary); }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 4px; }
  `],
})
export class ReportTimelyPage implements OnInit {
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  private service = inject(AdvancedReportsService);

  readonly rows = signal<TimelyReportRow[]>([]);
  readonly loading = signal(true);
  readonly range = signal<ReportRange>('week');
  readonly mode = signal<'hour' | 'weekday'>('hour');

  readonly total = computed(() => this.rows().reduce((s, r) => s + r.revenue, 0));
  readonly peak = computed(() => {
    const rows = this.rows();
    if (!rows.length) return null;
    return rows.reduce((a, b) => (b.revenue > a.revenue ? b : a), rows[0]);
  });

  constructor() {
    addIcons({ timeOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const data =
        this.mode() === 'hour'
          ? await this.service.timelyByHour(this.range())
          : await this.service.timelyByWeekday(this.range());
      this.rows.set(data);
    } catch (e: any) {
      console.error('load timely report failed', e);
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async onRange(value: any) {
    this.range.set(value);
    await this.load();
  }

  async onMode(value: any) {
    this.mode.set(value);
    await this.load();
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  percent(r: TimelyReportRow): number {
    const peak = this.peak()?.revenue ?? 0;
    return peak ? Math.round((r.revenue / peak) * 100) : 0;
  }

  formatMoney(v: number): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}

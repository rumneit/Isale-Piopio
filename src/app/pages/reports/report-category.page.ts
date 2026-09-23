import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonSpinner, IonNote, IonBadge, IonSegment, IonSegmentButton, IonList, IonItem, IonLabel,
  IonRefresher, IonRefresherContent, IonButton, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { downloadOutline, pieChartOutline } from 'ionicons/icons';
import { AdvancedReportsService, CategoryReportRow } from '../../core/services/advanced-reports.service';
import { ReportRange } from '../../core/services/reports.service';

@Component({
  selector: 'app-report-category',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonSpinner, IonNote, IonBadge, IonSegment, IonSegmentButton, IonList,
    IonItem, IonLabel, IonRefresher, IonRefresherContent, IonButton,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/report" /></ion-buttons>
        <ion-title>Doanh thu theo danh mục</ion-title>
        <ion-buttons slot="end">
          <ion-button [disabled]="rows().length === 0" (click)="exportCsv()">
            <ion-icon slot="icon-only" name="download-outline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="range()" (ionChange)="onRange($any($event.detail.value))">
          <ion-segment-button value="today">Hôm nay</ion-segment-button>
          <ion-segment-button value="week">Tuần</ion-segment-button>
          <ion-segment-button value="month">Tháng</ion-segment-button>
          <ion-segment-button value="year">Năm</ion-segment-button>
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
        } @else if (rows().length === 0) {
          <div class="app-empty">
            <div><ion-icon name="pie-chart-outline" /></div>
            Chưa có dữ liệu bán hàng trong kỳ này.
          </div>
        } @else {
          <div class="app-card">
            <div class="totals">
              <div><span class="muted">Tổng doanh thu</span><strong>{{ formatMoney(total()) }}</strong></div>
              <div><span class="muted">Số danh mục</span><strong>{{ rows().length }}</strong></div>
            </div>
          </div>
          <div class="app-card">
            <ion-list lines="full">
              @for (r of rows(); track r.category) {
                <ion-item>
                  <ion-label>
                    <h3>{{ r.category }}</h3>
                    <p>{{ r.qty }} sản phẩm · {{ percent(r) }}%</p>
                    <div class="bar"><div class="fill" [style.width.%]="percent(r)"></div></div>
                  </ion-label>
                  <ion-badge slot="end" color="tertiary">{{ formatMoney(r.total) }}</ion-badge>
                </ion-item>
              }
            </ion-list>
          </div>
          <ion-note class="page-hint">Doanh thu phân loại theo danh mục sản phẩm trong đơn</ion-note>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .totals { display: flex; gap: 28px; }
    .totals > div { display: flex; flex-direction: column; }
    .totals strong { font-size: 18px; color: var(--app-text); }
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
export class ReportCategoryPage implements OnInit {
  private service = inject(AdvancedReportsService);
  private toastCtrl = inject(ToastController);

  readonly rows = signal<CategoryReportRow[]>([]);
  readonly loading = signal(true);
  readonly range = signal<ReportRange>('month');

  readonly total = computed(() => this.rows().reduce((s, r) => s + r.total, 0));

  constructor() {
    addIcons({ downloadOutline, pieChartOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.rows.set(await this.service.categoryReport(this.range()));
    } catch (e: any) {
      console.error('load category report failed', e);
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async onRange(value: any) {
    this.range.set(value);
    await this.load();
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  percent(r: CategoryReportRow): number {
    const t = this.total();
    return t ? Math.round((r.total / t) * 100) : 0;
  }

  formatMoney(v: number): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  exportCsv() {
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      ['Danh mục', 'Số lượng', 'Doanh thu'].map(esc).join(','),
      ...this.rows().map((r) => [r.category, r.qty, r.total].map(esc).join(',')),
    ];
    this.download('doanh-thu-danh-muc.csv', lines.join('\r\n'));
  }

  private download(name: string, csv: string) {
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    this.toastCtrl.create({ message: 'Đã xuất CSV', duration: 1500 }).then((t) => t.present());
  }
}

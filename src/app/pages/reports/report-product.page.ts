import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonSegment, IonSegmentButton, IonLabel, IonList, IonItem, IonBadge, IonSpinner,
  IonNote, IonButton,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cubeOutline, podiumOutline, downloadOutline } from 'ionicons/icons';
import { ReportsService, ReportRange } from '../../core/services/reports.service';
import { CsvExportService } from '../../core/services/csv-export.service';

@Component({
  selector: 'app-report-product',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonSegment, IonSegmentButton, IonLabel, IonList, IonItem, IonBadge,
    IonSpinner, IonNote, IonButton,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/report" /><ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons>
        <ion-title>BC theo sản phẩm</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="exportCsv()"><ion-icon slot="icon-only" name="download-outline" /></ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="range()" (ionChange)="onRange($any($event))">
          <ion-segment-button value="today"><ion-label>Hôm nay</ion-label></ion-segment-button>
          <ion-segment-button value="week"><ion-label>Tuần</ion-label></ion-segment-button>
          <ion-segment-button value="month"><ion-label>Tháng</ion-label></ion-segment-button>
          <ion-segment-button value="year"><ion-label>Năm</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      @if (loading()) {
        <div class="page-loading"><ion-spinner name="crescent" /></div>
      } @else {
        <div class="app-page-container">
          <div class="app-card">
            <div class="app-card-title"><h4><ion-icon name="podium-outline" /> Xếp hạng bán chạy</h4></div>
            @if (products().length === 0) {
              <div class="app-empty">Chưa có dữ liệu bán hàng trong kỳ</div>
            } @else {
              <ion-list lines="full">
                @for (p of products(); track p.name; let i = $index) {
                  <ion-item>
                    <ion-badge slot="start" [color]="i === 0 ? 'warning' : 'light'">{{ i + 1 }}</ion-badge>
                    <ion-label>
                      <h3>{{ p.name }}</h3>
                      <p>{{ p.qty }} đã bán</p>
                    </ion-label>
                    <ion-note slot="end">{{ formatMoney(p.total) }}</ion-note>
                  </ion-item>
                }
              </ion-list>
            }
          </div>
        </div>
      }
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
  `],
})
export class ReportProductPage implements OnInit {
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  readonly reportsService = inject(ReportsService);
  private csvExport = inject(CsvExportService);

  readonly range = signal<ReportRange>('month');
  readonly products = signal<Array<{ name: string; qty: number; total: number }>>([]);
  readonly loading = signal(true);

  constructor() {
    addIcons({ cubeOutline, podiumOutline, downloadOutline });
  }

  ngOnInit(): void { this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const r = await this.reportsService.getReport(this.range());
      this.products.set(r.topProducts);
    } catch (e: any) {
      console.error('load product report failed', e);
      this.products.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async onRange(ev: CustomEvent) {
    this.range.set(ev.detail.value as ReportRange);
    await this.load();
  }

  exportCsv() {
    const rows = this.products().map((p, i) => [i + 1, p.name, p.qty, this.csvExport.formatMoney(p.total)]);
    this.csvExport.export('bc-san-pham', ['Hạng', 'Sản phẩm', 'Số lượng', 'Doanh thu'], rows);
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}

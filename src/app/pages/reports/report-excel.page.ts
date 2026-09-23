import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonSpinner, IonNote, IonSegment, IonSegmentButton, IonButton, IonRefresher,
  IonRefresherContent, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { downloadOutline, documentTextOutline } from 'ionicons/icons';
import { AdvancedReportsService, ExcelReportRow } from '../../core/services/advanced-reports.service';
import { ReportRange } from '../../core/services/reports.service';

@Component({
  selector: 'app-report-excel',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonSpinner, IonNote, IonSegment, IonSegmentButton, IonButton, IonRefresher,
    IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/report" /><ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons>
        <ion-title>Xuất dữ liệu (Excel/CSV)</ion-title>
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
            <div><ion-icon name="document-text-outline" /></div>
            Chưa có đơn hàng trong kỳ này để xuất.
          </div>
        } @else {
          <div class="app-card">
            <div class="totals">
              <div><span class="muted">Số dòng</span><strong>{{ rows().length }}</strong></div>
              <div><span class="muted">Số đơn</span><strong>{{ orderCount() }}</strong></div>
              <div><span class="muted">Tổng tiền hàng</span><strong>{{ formatMoney(itemTotal()) }}</strong></div>
            </div>
          </div>

          <div class="app-card table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Mã đơn</th><th>Ngày</th><th>Khách</th><th>Sản phẩm</th>
                  <th>SL</th><th>Đơn giá</th><th>Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                @for (r of preview(); track $index) {
                  <tr>
                    <td>{{ r.code }}</td>
                    <td>{{ r.created_at | date: 'dd/MM HH:mm' }}</td>
                    <td>{{ r.customer_name || '—' }}</td>
                    <td>{{ r.item_name || '—' }}</td>
                    <td>{{ r.qty }}</td>
                    <td>{{ formatMoney(r.price) }}</td>
                    <td>{{ formatMoney(r.total) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (rows().length > preview().length) {
            <ion-note class="page-hint">Đang hiển thị {{ preview().length }} / {{ rows().length }} dòng. Xuất CSV để lấy đầy đủ.</ion-note>
          }
          <ion-button expand="block" (click)="exportCsv()">
            <ion-icon slot="start" name="download-outline" /> Xuất toàn bộ ra CSV
          </ion-button>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .totals { display: flex; gap: 24px; flex-wrap: wrap; }
    .totals > div { display: flex; flex-direction: column; }
    .totals strong { font-size: 17px; color: var(--app-text); }
    .muted { font-size: 11.5px; color: var(--app-text-muted); }
    .table-scroll { overflow-x: auto; padding: 4px; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .data-table th { text-align: left; padding: 8px 10px; color: var(--app-text-muted); font-weight: 600; white-space: nowrap; border-bottom: 1px solid var(--app-border); }
    .data-table td { padding: 7px 10px; color: var(--app-text); white-space: nowrap; border-bottom: 1px dashed var(--app-border); }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 6px 4px; }
  `],
})
export class ReportExcelPage implements OnInit {
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  private service = inject(AdvancedReportsService);
  private toastCtrl = inject(ToastController);

  readonly rows = signal<ExcelReportRow[]>([]);
  readonly loading = signal(true);
  readonly range = signal<ReportRange>('month');

  readonly preview = signal<ExcelReportRow[]>([]);

  constructor() {
    addIcons({ downloadOutline, documentTextOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const data = await this.service.excelReport(this.range());
      this.rows.set(data);
      this.preview.set(data.slice(0, 50));
    } catch (e: any) {
      console.error('load excel report failed', e);
      this.rows.set([]);
      this.preview.set([]);
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

  orderCount(): number {
    return new Set(this.rows().map((r) => r.code)).size;
  }

  itemTotal(): number {
    return this.rows().reduce((s, r) => s + (Number(r.total) || 0), 0);
  }

  formatMoney(v: number): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  exportCsv() {
    const head = ['Mã đơn', 'Ngày', 'Khách hàng', 'Trạng thái', 'Thanh toán', 'Sản phẩm', 'SL', 'Đơn giá', 'Thành tiền'];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      head.map(esc).join(','),
      ...this.rows().map((r) =>
        [
          r.code,
          new Date(r.created_at).toLocaleString('vi-VN'),
          r.customer_name,
          r.status,
          r.paid,
          r.item_name,
          r.qty,
          r.price,
          r.total,
        ]
          .map(esc)
          .join(',')
      ),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `don-hang-${this.range()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.toastCtrl.create({ message: 'Đã xuất CSV', duration: 1500 }).then((t) => t.present());
  }
}

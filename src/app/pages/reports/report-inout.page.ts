import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonSpinner, IonBadge, IonNote, IonList, IonItem, IonLabel, IonRefresher, IonRefresherContent, IonButton,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { downloadOutline, downloadSharp, arrowRedoSharp } from 'ionicons/icons';
import { ShopTableService } from '../../core/services/shop-table.service';
import { CsvExportService } from '../../core/services/csv-export.service';

interface InOutRow {
  id: string;
  code: string;
  kind: 'in' | 'out';
  party: string;
  total: number;
  date: string;
}

@Component({
  selector: 'app-report-inout',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonSpinner, IonBadge, IonNote, IonList, IonItem, IonLabel, IonRefresher,
    IonRefresherContent, IonButton,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/report" /></ion-buttons>
        <ion-title>Báo cáo xuất nhập</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="exportCsv()"><ion-icon slot="icon-only" name="download-outline" /></ion-button>
        </ion-buttons>
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
          <div class="app-stats-row">
            <div class="app-stat">
              <div class="app-stat-label">Tổng nhập kho</div>
              <div class="app-stat-value" style="color: var(--ion-color-success)">{{ formatMoney(totalIn) }}</div>
              <div class="app-stat-sub">{{ inCount }} phiếu nhập</div>
            </div>
            <div class="app-stat">
              <div class="app-stat-label">Tổng xuất/chuyển kho</div>
              <div class="app-stat-value" style="color: var(--ion-color-warning)">{{ outCount }} phiếu</div>
              <div class="app-stat-sub">xuất khỏi cửa hàng</div>
            </div>
          </div>

          <div class="app-card">
            <div class="app-card-title"><h4><ion-icon name="swap-horizontal-outline" /> Lịch sử xuất nhập</h4></div>
            @if (items().length === 0) {
              <div class="app-empty">Chưa có phiếu nhập/xuất nào</div>
            } @else {
              <ion-list lines="full">
                @for (row of items(); track row.id) {
                  <ion-item>
                    <ion-icon slot="start" [name]="row.kind === 'in' ? 'download-outline' : 'arrow-redo-outline'"
                      [color]="row.kind === 'in' ? 'success' : 'warning'" />
                    <ion-label>
                      <h3>{{ row.code }}</h3>
                      <p>{{ row.party }} · {{ row.date | date: 'dd/MM HH:mm' }}</p>
                    </ion-label>
                    @if (row.total > 0) {
                      <ion-badge slot="end" [color]="row.kind === 'in' ? 'success' : 'warning'">{{ formatMoney(row.total) }}</ion-badge>
                    } @else {
                      <ion-badge slot="end" color="medium">{{ row.kind === 'in' ? 'Nhập' : 'Xuất' }}</ion-badge>
                    }
                  </ion-item>
                }
              </ion-list>
            }
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
  `],
})
export class ReportInOutPage implements OnInit {
  private svc = inject(ShopTableService);
  private csvExport = inject(CsvExportService);

  readonly items = signal<InOutRow[]>([]);
  readonly loading = signal(true);

  constructor() {
    addIcons({ downloadOutline, downloadSharp, arrowRedoSharp });
  }

  ngOnInit(): void { this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const [received, transfers] = await Promise.all([
        this.svc.list<any>('received_notes', 'created_at', false),
        this.svc.list<any>('transfers', 'created_at', false),
      ]);
      const rows: InOutRow[] = [
        ...received.map((r) => ({
          id: r.id,
          code: r.code,
          kind: 'in' as const,
          party: r.supplier_name ?? 'Nhà cung cấp',
          total: Number(r.total ?? 0),
          date: r.created_at,
        })),
        ...transfers.map((t) => ({
          id: t.id,
          code: t.code,
          kind: 'out' as const,
          party: t.destination ?? 'Nơi nhận',
          total: 0,
          date: t.created_at,
        })),
      ];
      rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      this.items.set(rows);
    } catch (e: any) {
      console.error('load inout report failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  get totalIn(): number {
    return this.items().filter((r) => r.kind === 'in').reduce((s, r) => s + r.total, 0);
  }

  get inCount(): number {
    return this.items().filter((r) => r.kind === 'in').length;
  }

  get outCount(): number {
    return this.items().filter((r) => r.kind === 'out').length;
  }

  exportCsv() {
    const rows = this.items().map((r) => [
      r.code,
      r.kind === 'in' ? 'Nhập kho' : 'Xuất kho',
      r.party,
      this.csvExport.formatMoney(r.total),
      this.csvExport.formatDateTime(r.date),
    ]);
    this.csvExport.export('bc-xuat-nhap', ['Mã phiếu', 'Loại', 'Đối tác/Nơi nhận', 'Giá trị', 'Thời gian'], rows);
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}

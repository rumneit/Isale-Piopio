import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonSpinner, IonBadge, IonNote, IonList, IonItem, IonLabel, IonRefresher, IonRefresherContent, IonButton,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cubeOutline, downloadOutline } from 'ionicons/icons';
import { ProductsService } from '../../core/services/products.service';
import { CsvExportService } from '../../core/services/csv-export.service';
import { Product } from '../../core/models/models';

@Component({
  selector: 'app-report-stock',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonSpinner, IonBadge, IonNote, IonList, IonItem, IonLabel, IonRefresher,
    IonRefresherContent, IonButton,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/report" /></ion-buttons>
        <ion-title>Báo cáo tồn kho</ion-title>
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
          <div class="summary-hero">
            <span>Tổng giá trị tồn kho (theo giá bán)</span>
            <strong>{{ formatMoney(totalValue) }}</strong>
            <span class="sub">{{ items().length }} sản phẩm</span>
          </div>

          <div class="app-card">
            @if (items().length === 0) {
              <div class="app-empty">Chưa có sản phẩm nào</div>
            } @else {
              <ion-list lines="full">
                @for (p of items(); track p.id) {
                  <ion-item>
                    <ion-icon slot="start" name="cube-outline" [color]="p.stock <= 0 ? 'danger' : 'primary'" />
                    <ion-label>
                      <h3>{{ p.name }}</h3>
                      <p>{{ p.unit ?? '—' }} · Đơn giá {{ formatMoney(p.price) }}</p>
                    </ion-label>
                    <div class="stock-end" slot="end">
                      <ion-badge [color]="p.stock > 0 ? 'primary' : 'danger'">Tồn: {{ formatQty(p.stock) }}</ion-badge>
                      <span class="stock-value">{{ formatMoney(p.stock * p.price) }}</span>
                    </div>
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
    .summary-hero { display: flex; flex-direction: column; gap: 3px; background: linear-gradient(135deg, var(--ion-color-primary) 0%, var(--ion-color-secondary) 100%); border-radius: 16px; padding: 18px; color: #fff; margin-bottom: 12px; }
    .summary-hero span { font-size: 13px; opacity: 0.9; }
    .summary-hero strong { font-size: 25px; font-weight: 800; letter-spacing: -0.02em; }
    .summary-hero .sub { font-size: 12px; opacity: 0.8; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
    .stock-end { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
    .stock-value { font-size: 12px; font-weight: 700; color: var(--app-text-muted); }
  `],
})
export class ReportStockPage implements OnInit {
  private productsService = inject(ProductsService);
  private csvExport = inject(CsvExportService);

  readonly items = signal<Product[]>([]);
  readonly loading = signal(true);

  constructor() {
    addIcons({ cubeOutline, downloadOutline });
  }

  ngOnInit(): void { this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const list = await this.productsService.list();
      this.items.set([...list].sort((a, b) => b.stock * b.price - a.stock * a.price));
    } catch (e: any) {
      console.error('load stock report failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  get totalValue(): number {
    return this.items().reduce((s, p) => s + p.stock * p.price, 0);
  }

  exportCsv() {
    const rows = this.items().map((p) => [p.name, p.unit ?? '', this.csvExport.formatMoney(p.stock), this.csvExport.formatMoney(p.price), this.csvExport.formatMoney(p.stock * p.price)]);
    this.csvExport.export('bc-ton-kho', ['Sản phẩm', 'Đơn vị', 'Tồn', 'Đơn giá', 'Giá trị tồn'], rows);
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  formatQty(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0);
  }
}

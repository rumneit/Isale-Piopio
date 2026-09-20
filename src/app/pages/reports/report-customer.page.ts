import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonSpinner, IonBadge, IonNote, IonList, IonItem, IonLabel, IonRefresher, IonRefresherContent, IonButton,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { personOutline, downloadOutline } from 'ionicons/icons';
import { OrdersService } from '../../core/services/orders.service';
import { CustomersService } from '../../core/services/customers.service';
import { CsvExportService } from '../../core/services/csv-export.service';

interface CustomerSummary {
  id: string;
  name: string;
  phone: string | null;
  debt: number;
  revenue: number;
  orderCount: number;
}

@Component({
  selector: 'app-report-customer',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonSpinner, IonBadge, IonNote, IonList, IonItem, IonLabel, IonRefresher,
    IonRefresherContent, IonButton,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/report" /></ion-buttons>
        <ion-title>Tổng hợp theo khách hàng</ion-title>
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
            <span>Tổng doanh thu theo khách · {{ items().length }} khách</span>
            <strong>{{ formatMoney(totalRevenue) }}</strong>
          </div>

          <div class="app-card">
            @if (items().length === 0) {
              <div class="app-empty">Chưa có dữ liệu khách hàng</div>
            } @else {
              <ion-list lines="full">
                @for (c of items(); track c.id) {
                  <ion-item>
                    <ion-icon slot="start" name="person-outline" color="primary" />
                    <ion-label>
                      <h3>{{ c.name }}</h3>
                      <p>{{ c.orderCount }} đơn · Nợ: {{ formatMoney(c.debt) }}</p>
                    </ion-label>
                    <ion-badge slot="end" color="primary">{{ formatMoney(c.revenue) }}</ion-badge>
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
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
  `],
})
export class ReportCustomerPage implements OnInit {
  private ordersService = inject(OrdersService);
  private customersService = inject(CustomersService);
  private csvExport = inject(CsvExportService);

  readonly items = signal<CustomerSummary[]>([]);
  readonly loading = signal(true);

  constructor() {
    addIcons({ personOutline, downloadOutline });
  }

  ngOnInit(): void { this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const [customers, orders] = await Promise.all([
        this.customersService.list(),
        this.ordersService.list(),
      ]);
      const map = new Map<string, CustomerSummary>();
      for (const c of customers) {
        map.set(c.id, { id: c.id, name: c.name, phone: c.phone, debt: Number(c.debt ?? 0), revenue: 0, orderCount: 0 });
      }
      for (const o of orders) {
        if (!o.customer_id) continue;
        const row = map.get(o.customer_id);
        if (!row) continue;
        row.revenue += Number(o.total ?? 0);
        row.orderCount += 1;
      }
      this.items.set([...map.values()].sort((a, b) => b.revenue - a.revenue));
    } catch (e: any) {
      console.error('load customer report failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  get totalRevenue(): number {
    return this.items().reduce((s, c) => s + c.revenue, 0);
  }

  exportCsv() {
    const rows = this.items().map((c) => [c.name, c.phone ?? '', c.orderCount, this.csvExport.formatMoney(c.revenue), this.csvExport.formatMoney(c.debt)]);
    this.csvExport.export('bc-khach-hang', ['Khách hàng', 'SĐT', 'Số đơn', 'Doanh thu', 'Công nợ'], rows);
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}

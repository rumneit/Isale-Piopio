import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonButton,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { peopleOutline, downloadOutline } from 'ionicons/icons';
import { CustomersService } from '../../core/services/customers.service';
import { CsvExportService } from '../../core/services/csv-export.service';
import { Customer } from '../../core/models/models';

@Component({
  selector: 'app-report-debt',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonButton,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/report" /></ion-buttons>
        <ion-title>BC công nợ</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="exportCsv()"><ion-icon slot="icon-only" name="download-outline" /></ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      @if (loading()) {
        <div class="page-loading"><ion-spinner name="crescent" /></div>
      } @else {
        <div class="app-page-container">
          <div class="debt-hero">
            <span>Tổng nợ phải thu · {{ items().length }} khách</span>
            <strong>{{ formatMoney(totalDebt) }}</strong>
          </div>

          @if (items().length === 0) {
            <div class="app-empty">Không có khách hàng nào còn nợ 🎉</div>
          } @else {
            <div class="app-card">
              <ion-list lines="full">
                @for (c of items(); track c.id) {
                  <ion-item>
                    <ion-icon slot="start" name="people-outline" color="warning" />
                    <ion-label>
                      <h3>{{ c.name }}</h3>
                      <p>{{ c.phone ?? '—' }}</p>
                    </ion-label>
                    <ion-badge slot="end" color="warning">{{ formatMoney(c.debt) }}</ion-badge>
                  </ion-item>
                }
              </ion-list>
            </div>
          }
        </div>
      }
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .debt-hero { display: flex; align-items: center; justify-content: space-between; background: linear-gradient(135deg, var(--ion-color-danger) 0%, var(--ion-color-warning) 100%); border-radius: 14px; padding: 16px; color: #fff; margin-bottom: 14px; }
    .debt-hero span { font-size: 13px; }
    .debt-hero strong { font-size: 20px; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
  `],
})
export class ReportDebtPage implements OnInit {
  private customersService = inject(CustomersService);
  private csvExport = inject(CsvExportService);

  readonly items = signal<Customer[]>([]);
  readonly loading = signal(true);

  constructor() {
    addIcons({ peopleOutline, downloadOutline });
  }

  ngOnInit(): void { this.load(); }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.customersService.list('', true));
    } catch (e: any) {
      console.error('load debt report failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  get totalDebt(): number {
    return this.items().reduce((s, c) => s + Number(c.debt ?? 0), 0);
  }

  exportCsv() {
    const rows = this.items().map((c) => [c.name, c.phone ?? '', this.csvExport.formatMoney(c.debt)]);
    this.csvExport.export('bc-cong-no', ['Khách hàng', 'SĐT', 'Còn nợ'], rows);
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonButton,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonIcon,
  IonContent,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonSpinner,
  IonBadge,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  IonList,
  IonItem,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  barChartOutline,
  trendingUpOutline,
  trendingDownOutline,
  cartOutline,
  podiumOutline,
} from 'ionicons/icons';
import { ReportsService, ReportRange, ReportResult } from '../../core/services/reports.service';

@Component({
  selector: 'app-report-chart',
  templateUrl: './report-chart.page.html',
  styleUrls: ['./report-chart.page.scss'],
  imports: [
    IonButton,
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonIcon,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonSpinner,
    IonBadge,
    IonNote,
    IonRefresher,
    IonRefresherContent,
    IonList,
    IonItem,
  ],
})
export class ReportChartPage implements OnInit {
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  readonly reportsService = inject(ReportsService);

  readonly ranges: { value: ReportRange; label: string }[] = [
    { value: 'today', label: 'Hôm nay' },
    { value: 'week', label: 'Tuần' },
    { value: 'month', label: 'Tháng' },
    { value: 'year', label: 'Năm' },
  ];

  readonly range = signal<ReportRange>('month');
  readonly report = signal<ReportResult | null>(null);
  readonly loading = signal(true);

  constructor() {
    addIcons({
      barChartOutline,
      trendingUpOutline,
      trendingDownOutline,
      cartOutline,
      podiumOutline,
    });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.report.set(await this.reportsService.getReport(this.range()));
    } catch (e: any) {
      console.error('load report failed', e);
      this.report.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  async onRange(ev: CustomEvent) {
    this.range.set(ev.detail.value as ReportRange);
    await this.load();
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  maxDailyRevenue(): number {
    const rows = this.report()?.daily ?? [];
    return Math.max(1, ...rows.map((r) => r.revenue));
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  formatDay(date: string): string {
    const [y, m, d] = date.split('-');
    return `${d}/${m}`;
  }
}

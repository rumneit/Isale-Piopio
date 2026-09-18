import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonIcon,
  IonContent,
  IonSearchbar,
  IonRefresher,
  IonRefresherContent,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonFab,
  IonFabButton,
  IonSpinner,
  IonSegment,
  IonSegmentButton,
  IonNote,
  IonButton,
  AlertController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline,
  swapHorizontalOutline,
  trendingUpOutline,
  trendingDownOutline,
  trashOutline,
  downloadOutline,
} from 'ionicons/icons';
import { TransactionsService } from '../../core/services/transactions.service';
import { CsvExportService } from '../../core/services/csv-export.service';
import { Transaction } from '../../core/models/models';

@Component({
  selector: 'app-trades',
  templateUrl: './trades.page.html',
  styleUrls: ['./trades.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonIcon,
    IonContent,
    IonSearchbar,
    IonRefresher,
    IonRefresherContent,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonFab,
    IonFabButton,
    IonSpinner,
    IonSegment,
    IonSegmentButton,
    IonNote,
    IonButton,
  ],
})
export class TradesPage implements OnInit {
  private transactionsService = inject(TransactionsService);
  private csvExport = inject(CsvExportService);
  private router = inject(Router);
  private alertCtrl = inject(AlertController);

  readonly items = signal<Transaction[]>([]);
  readonly loading = signal(true);
  readonly typeFilter = signal<'all' | 'income' | 'expense'>('all');
  search = '';

  constructor() {
    addIcons({ addOutline, swapHorizontalOutline, trendingUpOutline, trendingDownOutline, trashOutline, downloadOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.transactionsService.list(this.typeFilter(), this.search));
    } catch (e: any) {
      console.error('load transactions failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async onSearch(ev: CustomEvent) {
    this.search = (ev.detail as any).value ?? '';
    await this.load();
  }

  async onFilter(ev: CustomEvent) {
    this.typeFilter.set(ev.detail.value as any);
    await this.load();
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  openAdd() {
    this.router.navigateByUrl('/trade/add');
  }

  exportCsv() {
    const rows = this.items().map((t) => [
      t.type === 'income' ? 'Thu' : 'Chi',
      t.category ?? '',
      t.note ?? '',
      this.csvExport.formatMoney(t.amount),
      this.csvExport.formatDateTime(t.occurred_at),
    ]);
    this.csvExport.export('giao-dich', ['Loại', 'Nhóm', 'Ghi chú', 'Số tiền', 'Thời gian'], rows);
  }

  async confirmDelete(item: Transaction) {
    const alert = await this.alertCtrl.create({
      header: 'Xóa giao dịch',
      message: `Xóa giao dịch "${item.note || item.category || ''}" (${this.formatMoney(item.amount)})?`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        { text: 'Xóa', role: 'destructive', handler: () => this.doDelete(item) },
      ],
    });
    await alert.present();
  }

  private async doDelete(item: Transaction) {
    try {
      await this.transactionsService.remove(item.id);
      await this.load();
    } catch (e: any) {
      console.error('delete transaction failed', e);
    }
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}

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
  ActionSheetController,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline,
  swapHorizontalOutline,
  trendingUpOutline,
  trendingDownOutline,
  trashOutline,
  downloadOutline,
  createOutline,
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
  private actionSheetCtrl = inject(ActionSheetController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly items = signal<Transaction[]>([]);
  readonly loading = signal(true);
  readonly typeFilter = signal<'all' | 'income' | 'expense'>('all');
  search = '';

  constructor() {
    addIcons({ addOutline, swapHorizontalOutline, trendingUpOutline, trendingDownOutline, trashOutline, downloadOutline, createOutline });
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

  async openItemActions(item: Transaction) {
    const sheet = await this.actionSheetCtrl.create({
      header: item.note || item.category || (item.type === 'income' ? 'Thu' : 'Chi'),
      buttons: [
        {
          text: 'Sửa giao dịch',
          icon: 'create-outline',
          handler: () => this.editItem(item),
        },
        {
          text: 'Xóa giao dịch',
          icon: 'trash-outline',
          role: 'destructive',
          handler: () => this.doDelete(item),
        },
        { text: 'Hủy', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  async editItem(item: Transaction) {
    const alert = await this.alertCtrl.create({
      header: 'Sửa giao dịch',
      inputs: [
        { name: 'amount', type: 'number', value: String(item.amount ?? 0), placeholder: 'Số tiền (₫)' },
        { name: 'note', type: 'text', value: item.note ?? '', placeholder: 'Ghi chú' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Lưu',
          handler: async (data) => {
            const amount = Number(data?.amount ?? 0);
            if (!amount || amount <= 0) {
              this.toast('Số tiền không hợp lệ', 'danger');
              return false;
            }
            try {
              await this.transactionsService.update(item.id, {
                amount,
                note: (data?.note ?? '').trim() || null,
              });
              this.toast('Đã cập nhật giao dịch');
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Cập nhật thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
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

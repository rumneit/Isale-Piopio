import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonButton,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonIcon,
  IonContent,
  IonSearchbar,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonFab,
  IonFabButton,
  IonSpinner,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, downloadOutline, alertCircleOutline, checkmarkCircleOutline, timeOutline } from 'ionicons/icons';
import { FabTrioComponent } from '../../shared/fab-trio/fab-trio.component';
import { ReceivedNotesService, ReceivedNote } from '../../core/services/received-notes.service';
import { InventoryLedgerService } from '../../core/services/inventory-ledger.service';
import { DataService } from '../../core/services/data.service';

@Component({
  selector: 'app-received-notes',
  templateUrl: './received-notes.page.html',
  styleUrls: ['./received-notes.page.scss'],
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
    IonSearchbar,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonFab,
    IonFabButton,
    IonSpinner,
    IonNote,
    IonRefresher,
    IonRefresherContent,
      FabTrioComponent,
  ],
})
export class ReceivedNotesPage implements OnInit {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  private notesService = inject(ReceivedNotesService);
  private ledger = inject(InventoryLedgerService);
  private dataService = inject(DataService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);

  readonly items = signal<ReceivedNote[]>([]);
  readonly loading = signal(true);
  search = '';

  constructor() {
    addIcons({ addOutline, downloadOutline, alertCircleOutline, checkmarkCircleOutline, timeOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.notesService.list(this.search));
    } catch (e: any) {
      console.error('load received notes failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async onSearch(ev: CustomEvent) {
    this.search = (ev.detail as any).value ?? '';
    await this.load();
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  openAdd() {
    this.router.navigateByUrl('/module/received-note-add');
  }

  async confirmDelete(note: ReceivedNote) {
    const alert = await this.alertCtrl.create({
      header: 'Xóa phiếu nhập',
      message: `Xóa ${note.code}? Tồn kho của ${note.items.length} sản phẩm sẽ được hoàn lại.`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: async () => {
            try {
              await this.notesService.remove(note);
              this.toast('Đã xóa phiếu nhập');
              await this.load();
              this.dataService.refreshHome();
            } catch (e: any) {
              this.toast(e?.message ?? 'Xóa thất bại', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  /** Lịch sử thay đổi phiếu (audit trail — v27) */
  async openHistory(note: ReceivedNote, ev?: Event) {
    ev?.stopPropagation();
    const rows = await this.ledger.history('received_notes', note.id, 50);
    const actionLabel: Record<string, string> = {
      create: 'Tạo phiếu',
      update: 'Sửa phiếu',
      delete: 'Xoá phiếu',
      manual_adjust: 'Chỉnh tồn tay',
    };
    const body = rows.length
      ? rows
          .map((r) => {
            const t = new Date(r.created_at).toLocaleString('vi-VN');
            const who = r.actor_id ? '' : '';
            const detail =
              r.action === 'manual_adjust' && r.before && r.after
                ? ` (${Number(r.before.stock ?? 0)} → ${Number(r.after.stock ?? 0)})`
                : '';
            return `${t} · ${actionLabel[r.action] ?? r.action}${detail}${who}`;
          })
          .join('\n')
      : 'Chưa có lịch sử (dữ liệu ghi từ khi chạy migration v27).';
    const alert = await this.alertCtrl.create({
      header: `Lịch sử ${note.code}`,
      message: `<pre style="white-space:pre-wrap;font-size:12px;margin:0">${body}</pre>`,
      buttons: ['Đóng'],
    });
    await alert.present();
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

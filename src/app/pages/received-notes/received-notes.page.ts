import { Component, OnInit, inject, signal, computed } from '@angular/core';
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
  IonSegment,
  IonSegmentButton,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, downloadOutline, alertCircleOutline, checkmarkCircleOutline, timeOutline, hourglassOutline, cubeOutline } from 'ionicons/icons';
import { FabTrioComponent } from '../../shared/fab-trio/fab-trio.component';
import { ReceivedNotesService, ReceivedNote } from '../../core/services/received-notes.service';
import { InventoryLedgerService, OpenReceiveNote } from '../../core/services/inventory-ledger.service';
import { AuthService } from '../../core/services/auth.service';
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
    IonSegment,
    IonSegmentButton,
      FabTrioComponent,
  ],
})
export class ReceivedNotesPage implements OnInit {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  private notesService = inject(ReceivedNotesService);
  private ledger = inject(InventoryLedgerService);
  private auth = inject(AuthService);
  private dataService = inject(DataService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);

  readonly items = signal<ReceivedNote[]>([]);
  /** Danh sách phiếu còn thiếu hàng ("Chờ nhập thêm") — null khi v29 chưa chạy. */
  readonly openNotes = signal<OpenReceiveNote[] | null>(null);
  readonly loading = signal(true);
  readonly segment = signal<'all' | 'pending' | 'shortage'>('all');
  search = '';

  /** Người dùng hiện tại có quyền duyệt phiếu nhập (chủ shop hoặc được cấp cờ). */
  get canApprove(): boolean {
    return this.auth.can('inventory_approve');
  }

  readonly pendingItems = computed(() => this.items().filter((n) => n.status === 'pending'));

  constructor() {
    addIcons({ addOutline, downloadOutline, alertCircleOutline, checkmarkCircleOutline, timeOutline, hourglassOutline, cubeOutline });
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
    try {
      this.openNotes.set(await this.ledger.openReceiveNotes());
    } catch (e: any) {
      console.error('load open receive notes failed', e);
      this.openNotes.set(null);
    }
  }

  changeSegment(ev: CustomEvent) {
    this.segment.set((ev.detail as any).value ?? 'all');
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

  /** Bấm vào phiếu: pending → duyệt/từ chối; cancelled → xoá hẳn; còn lại → xoá (hoàn tồn). */
  onItemTap(note: ReceivedNote) {
    if (note.status === 'pending') {
      this.openPendingActions(note);
    } else if (note.status === 'cancelled') {
      this.confirmDeleteCancelled(note);
    } else {
      this.confirmDelete(note);
    }
  }

  /** Action sheet duyệt / từ chối phiếu chờ (chỉ người có quyền duyệt). */
  private async openPendingActions(note: ReceivedNote) {
    if (!this.canApprove) {
      const alert = await this.alertCtrl.create({
        header: note.code,
        message: 'Phiếu đang chờ chủ shop duyệt. Tồn kho và tiền sẽ chỉ được ghi sau khi duyệt.',
        buttons: ['Đóng'],
      });
      await alert.present();
      return;
    }
    const alert = await this.alertCtrl.create({
      header: `Duyệt ${note.code}`,
      message: `${note.items.length} sản phẩm · ${this.formatMoney(note.total)} — duyệt sẽ ghi tồn kho${Number(note.paid_amount ?? 0) > 0 ? ' và ghi chi tiền đã trả' : ''}${note.supplier_id && note.total - Number(note.paid_amount ?? 0) > 0 ? ' và ghi công nợ NCC' : ''}.`,
      buttons: [
        { text: 'Đóng', role: 'cancel' },
        {
          text: 'Từ chối',
          role: 'destructive',
          handler: () => { void this.promptReject(note); },
        },
        {
          text: 'Duyệt phiếu',
          handler: () => { void this.approve(note); },
        },
      ],
    });
    await alert.present();
  }

  private async approve(note: ReceivedNote) {
    try {
      const res = await this.ledger.approveNote(note.id, this.makeNonce());
      if (res === null) {
        this.toast('Chưa chạy migration v29 — không duyệt được.', 'danger');
        return;
      }
      this.toast(
        res.status === 'partial'
          ? `Đã duyệt ${note.code} — còn thiếu hàng, xem "Chờ nhập thêm"`
          : `Đã duyệt ${note.code} — tồn kho đã cập nhật`
      );
      await this.load();
      this.dataService.refreshHome();
    } catch (e: any) {
      this.toast(e?.message ?? 'Duyệt phiếu thất bại', 'danger');
    }
  }

  private async promptReject(note: ReceivedNote) {
    const alert = await this.alertCtrl.create({
      header: `Từ chối ${note.code}`,
      message: 'Phiếu sẽ bị huỷ, không ghi tồn kho hay tiền.',
      inputs: [{ name: 'reason', type: 'text', placeholder: 'Lý do từ chối (không bắt buộc)' }],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Từ chối',
          role: 'destructive',
          handler: async (data) => {
            try {
              const ok = await this.ledger.rejectNote(note.id, String(data?.reason ?? '').trim() || null);
              if (ok === null) {
                this.toast('Chưa chạy migration v29 — không từ chối được.', 'danger');
                return;
              }
              this.toast(`Đã từ chối ${note.code}`);
              await this.load();
            } catch (e: any) {
              this.toast(e?.message ?? 'Từ chối thất bại', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  /** Xoá hẳn phiếu đã huỷ (không hoàn tồn — chưa bao giờ ghi). */
  private async confirmDeleteCancelled(note: ReceivedNote) {
    const alert = await this.alertCtrl.create({
      header: 'Xóa phiếu đã huỷ',
      message: `Xóa hẳn ${note.code}? Phiếu này chưa ghi tồn kho.`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: async () => {
            try {
              await this.notesService.remove(note);
              this.toast('Đã xóa phiếu');
              await this.load();
            } catch (e: any) {
              this.toast(e?.message ?? 'Xóa thất bại', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  /** "Nhập tiếp phần thiếu": sang form nhập, prefill phần còn thiếu của phiếu gốc. */
  continueNote(open: OpenReceiveNote) {
    this.router.navigate(['/received-note/add'], { queryParams: { continue: open.root_id } });
  }

  statusBadge(note: ReceivedNote): { label: string; color: string } | null {
    switch (note.status) {
      case 'pending': return { label: 'Chờ duyệt', color: 'warning' };
      case 'partial': return { label: 'Nhập thiếu', color: 'tertiary' };
      case 'cancelled': return { label: 'Đã huỷ', color: 'medium' };
      default: return null; // completed — không cần badge
    }
  }

  private makeNonce(): string {
    return (crypto?.randomUUID?.() ?? `rn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
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

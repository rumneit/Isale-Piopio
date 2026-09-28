import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
  IonSpinner, IonList, IonItem, IonInput, IonSelect, IonSelectOption, IonBadge,
  IonLabel, IonNote, ToastController, AlertController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { closeOutline, homeOutline, checkmarkDoneOutline, warningOutline } from 'ionicons/icons';
import { SupabaseService } from '../../core/services/supabase.service';
import { InventoryLedgerService } from '../../core/services/inventory-ledger.service';

interface TransferRow {
  id: string;
  code: string;
  destination: string | null;
  items: Array<{ product_id: string | null; name: string; qty: number }>;
  note: string | null;
  status?: string;
  created_at: string;
}

interface ReceiveLine {
  product_id: string;
  name: string;
  qty_sent: number;
  qty_received: number;
}

@Component({
  selector: 'app-transfer-receive',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
    IonContent, IonSpinner, IonList, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption,
    IonBadge, IonNote, FormsModule,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="goBack()"><ion-icon slot="icon-only" name="close-outline" /></ion-button>
          <ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button>
        </ion-buttons>
        <ion-title>Nhận hàng chuyển kho</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <div class="app-page-container">
        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else if (error) {
          <div class="app-empty"><div><ion-icon name="warning-outline" /></div>{{ error }}</div>
        } @else if (transfer()) {
          @if (error) { <div class="form-error">{{ error }}</div> }

          <div class="app-card">
            <div class="app-card-title"><h4>{{ transfer()!.code }} → {{ transfer()!.destination ?? 'Không rõ nơi đến' }}</h4></div>
            <ion-note class="card-hint">Nhập số lượng THỰC NHẬN từng dòng. Thiếu hơn sẽ ghi hao hụt có lý do.</ion-note>
          </div>

          <div class="app-card">
            <ion-list lines="full">
              @for (line of lines(); track line.product_id; let i = $index) {
                <ion-item>
                  <ion-label class="line-name">
                    <h3>{{ line.name }}</h3>
                    <p>Gửi {{ line.qty_sent }}</p>
                  </ion-label>
                  <ion-input class="line-qty" type="number" [min]="0" [max]="line.qty_sent" [(ngModel)]="lines()[i].qty_received" />
                  @if (lossOf(line) > 0) {
                    <ion-badge slot="end" color="danger">Hụt {{ lossOf(line) }}</ion-badge>
                  } @else {
                    <ion-badge slot="end" color="success">Đủ</ion-badge>
                  }
                </ion-item>
              }
            </ion-list>
          </div>

          @if (totalLoss() > 0) {
            <div class="app-card">
              <ion-list lines="full">
                <ion-item>
                  <ion-select label="Lý do hao hụt" labelPlacement="stacked" [(ngModel)]="reason" interface="action-sheet" cancelText="Đóng">
                    <ion-select-option value="damaged">Hàng vỡ/hỏng khi vận chuyển</ion-select-option>
                    <ion-select-option value="lost">Thất thoát</ion-select-option>
                    <ion-select-option value="wrong_item">Gửi sai mặt hàng</ion-select-option>
                    <ion-select-option value="other">Khác</ion-select-option>
                  </ion-select>
                </ion-item>
                @if (reason === 'other') {
                  <ion-item>
                    <ion-input label="Mô tả lý do *" labelPlacement="stacked" [(ngModel)]="reasonNote" placeholder="VD: Xe lật 2 thùng nước mắm" />
                  </ion-item>
                }
                <ion-item>
                  <ion-select label="Xử lý phần hụt" labelPlacement="stacked" [(ngModel)]="resolution" interface="action-sheet" cancelText="Đóng">
                    <ion-select-option value="write_off">Ghi giảm — mất hàng thật</ion-select-option>
                    <ion-select-option value="return_to_source">Hoàn về kho nguồn (xe trả hàng)</ion-select-option>
                  </ion-select>
                </ion-item>
              </ion-list>
            </div>
          }

          <div class="total-box">
            <span>Đã nhận / Hao hụt</span>
            <strong>{{ totalReceived() }} / {{ totalLoss() }}</strong>
          </div>

          <ion-button expand="block" size="large" (click)="confirmReceive()" [disabled]="busy()">
            <ion-icon slot="start" name="checkmark-done-outline" />
            Xác nhận đã nhận hàng
          </ion-button>
          <ion-note class="page-hint">Tồn kho chỉ tăng theo số THỰC NHẬN · Migration v28</ion-note>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    .form-error { background: var(--app-danger-soft-bg); color: var(--app-danger-soft-text); border-radius: 10px; padding: 10px 12px; font-size: 13px; margin-bottom: 12px; }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .card-hint { display: block; padding: 0 14px 10px; font-size: 12px; color: var(--app-text-muted); }
    .line-name h3 { font-size: 14px; font-weight: 600; }
    .line-qty { width: 84px; text-align: center; flex-shrink: 0; }
    .total-box { display: flex; align-items: center; justify-content: space-between; background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 14px; padding: 14px 16px; margin-bottom: 14px; }
    .total-box span { color: var(--app-text-muted); font-size: 14px; }
    .total-box strong { font-size: 18px; color: var(--ion-color-primary); }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 4px; }
  `],
})
export class TransferReceivePage implements OnInit {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  private sb = inject(SupabaseService);
  private ledger = inject(InventoryLedgerService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);

  readonly transfer = signal<TransferRow | null>(null);
  readonly lines = signal<ReceiveLine[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);

  reason: 'damaged' | 'lost' | 'wrong_item' | 'other' = 'other';
  reasonNote = '';
  resolution: 'write_off' | 'return_to_source' = 'write_off';
  error = '';

  constructor() {
    addIcons({ closeOutline, homeOutline, checkmarkDoneOutline, warningOutline });
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id || !this.sb.isConfigured) {
      this.error = 'Không tìm thấy phiếu chuyển.';
      this.loading.set(false);
      return;
    }
    try {
      const { data, error } = await this.sb.from('transfers').select('*').eq('id', id).single();
      if (error) throw error;
      const t = data as TransferRow;
      if (t.status && t.status !== 'in_transit') {
        this.error = `Phiếu ${t.code} không ở trạng thái đang đi (đã hoàn tất hoặc legacy).`;
      } else {
        this.transfer.set(t);
        this.lines.set(
          (t.items ?? [])
            .filter((i) => i.product_id)
            .map((i) => ({ product_id: i.product_id!, name: i.name, qty_sent: Number(i.qty ?? 0), qty_received: Number(i.qty ?? 0) }))
        );
      }
    } catch (e: any) {
      this.error = e?.message ?? 'Không tải được phiếu chuyển.';
    } finally {
      this.loading.set(false);
    }
  }

  lossOf(line: ReceiveLine): number {
    return Math.max(0, line.qty_sent - (Number(line.qty_received) || 0));
  }

  totalReceived(): number {
    return this.lines().reduce((s, l) => s + (Number(l.qty_received) || 0), 0);
  }

  totalLoss(): number {
    return this.lines().reduce((s, l) => s + this.lossOf(l), 0);
  }

  async confirmReceive() {
    this.error = '';
    const t = this.transfer();
    if (!t) return;
    const loss = this.totalLoss();
    if (loss > 0 && this.reason === 'other' && !this.reasonNote.trim()) {
      this.error = 'Hao hụt cần mô tả lý do (hoặc chọn lý do cụ thể).';
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Xác nhận nhận hàng',
      message: loss > 0
        ? `Nhận ${this.totalReceived()}/${this.totalReceived() + loss} SP · Hao hụt ${loss} (${this.resolution === 'write_off' ? 'ghi giảm' : 'hoàn về kho nguồn'})`
        : `Nhận đủ ${this.totalReceived()} SP`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        { text: 'Xác nhận', handler: () => this.doReceive() },
      ],
    });
    await alert.present();
  }

  private async doReceive() {
    this.busy.set(true);
    try {
      const res = await this.ledger.receiveTransfer({
        transferId: this.transfer()!.id,
        items: this.lines(),
        resolution: this.resolution,
        reason: this.reason,
        reasonNote: this.reason === 'other' ? this.reasonNote.trim() || null : null,
      });
      if (res.fallback) {
        this.error = 'Chưa chạy migration v28 — tính năng nhận hàng đang đi cần RPC inv_receive_transfer.';
        return;
      }
      if (res.already) {
        this.toast('Phiếu này đã được nhận trước đó');
      } else {
        const loss = this.totalLoss();
        this.toast(loss > 0 ? `Đã nhận ${this.totalReceived()} SP — hao hụt ${loss} đã ghi nhận` : `Đã nhận đủ ${this.totalReceived()} SP`);
      }
      this.router.navigateByUrl('/transfer', { replaceUrl: true });
    } catch (e: any) {
      this.error = e?.message ?? 'Nhận hàng thất bại.';
    } finally {
      this.busy.set(false);
    }
  }

  goBack() {
    this.router.navigateByUrl('/transfer', { replaceUrl: true });
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 2000, color, position: 'bottom' });
    await t.present();
  }
}

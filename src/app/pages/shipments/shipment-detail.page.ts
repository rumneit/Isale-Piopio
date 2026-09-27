import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonSpinner,
  IonBadge,
  IonNote,
  IonBackButton,
  IonList,
  IonItem,
  IonLabel,
  ActionSheetController,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  homeOutline,
  printOutline,
  cubeOutline,
  swapVerticalOutline,
  banOutline,
  trashOutline,
  navigateOutline,
  locationOutline,
  checkmarkCircle,
  ellipse,
  pulseOutline,
} from 'ionicons/icons';
import { ShipmentsService } from '../../core/services/shipments.service';
import { AuthService } from '../../core/services/auth.service';
import { Shipment, ShipmentStatus, ShipmentTrackingLog } from '../../core/models/models';
import { printShipmentA6Label } from './shipment-label.print';

/** 6 mốc tiến trình chính (thanh tiến trình phía trên timeline) */
const PROGRESS_STEPS: { value: ShipmentStatus; label: string }[] = [
  { value: 'submitted', label: 'Đã tạo' },
  { value: 'picking', label: 'Lấy hàng' },
  { value: 'in_transit', label: 'Vận chuyển' },
  { value: 'out_for_delivery', label: 'Đang phát' },
  { value: 'delivered', label: 'Đã giao' },
];

@Component({
  selector: 'app-shipment-detail',
  templateUrl: './shipment-detail.page.html',
  styleUrls: ['./shipment-detail.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSpinner,
    IonBadge,
    IonNote,
    IonBackButton,
    IonList,
    IonItem,
    IonLabel,
  ],
})
export class ShipmentDetailPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly shipmentsService = inject(ShipmentsService);
  private auth = inject(AuthService);
  private actionSheetCtrl = inject(ActionSheetController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly shipment = signal<Shipment | null>(null);
  readonly logs = signal<ShipmentTrackingLog[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);

  readonly progressSteps = PROGRESS_STEPS;

  constructor() {
    addIcons({
      homeOutline,
      printOutline,
      cubeOutline,
      swapVerticalOutline,
      banOutline,
      trashOutline,
      navigateOutline,
      locationOutline,
      checkmarkCircle,
      ellipse,
      pulseOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.loading.set(true);
    try {
      const [shipment, logs] = await Promise.all([this.shipmentsService.get(id), this.shipmentsService.listLogs(id)]);
      this.shipment.set(shipment);
      this.logs.set(logs);
    } catch (e: any) {
      console.error('load shipment failed', e);
    } finally {
      this.loading.set(false);
    }
  }

  openHome() {
    this.router.navigateByUrl('/home');
  }

  openOrder(orderId: string | null) {
    if (orderId) this.router.navigateByUrl(`/order/${orderId}`);
  }

  // ================= Thanh tiến trình =================

  /** Index của mốc hiện tại trong PROGRESS_STEPS; nhánh hoàn trả/exception/hủy = -1 (không vẽ) */
  progressIndex(status: ShipmentStatus): number {
    const idx = PROGRESS_STEPS.findIndex((s) => s.value === status);
    if (idx !== -1) return idx;
    if (status === 'draft') return -1;
    return -1;
  }

  /** Nhánh phụ (hoàn/hủy/lỗi) hiển thị banner thay cho progress */
  branchLabel(status: ShipmentStatus): string | null {
    switch (status) {
      case 'returning':
        return 'Đang hoàn hàng về shop';
      case 'returned':
        return 'Đã hoàn hàng về shop';
      case 'cancelled':
        return 'Vận đơn đã hủy';
      case 'exception':
        return 'Vận đơn gặp sự cố';
      case 'failed':
        return 'Giao thất bại — chờ giao lại hoặc hoàn';
      case 'draft':
        return 'Nháp — chưa gửi hãng';
      default:
        return null;
    }
  }

  // ================= Hành động =================

  printLabel() {
    const s = this.shipment();
    if (!s) return;
    if (s.label_url) {
      window.open(s.label_url, '_blank');
      return;
    }
    const result = printShipmentA6Label({
      shipment: s,
      shopName: this.auth.shop()?.name ?? 'PioPio',
      providerLabel: this.shipmentsService.providerLabel(s.provider),
      formatWeight: (g) => this.shipmentsService.formatWeight(g),
      formatMoney: (v) => this.money(v),
    });
    if (!result.ok) this.toast(result.reason ?? 'Không mở được cửa sổ in', 'warning');
  }

  async changeStatus() {
    const s = this.shipment();
    if (!s || this.busy()) return;
    const sheet = await this.actionSheetCtrl.create({
      header: `${s.tracking_code} — ${ShipmentsService.statusLabel(s.status)}`,
      subHeader: 'Chọn trạng thái mới',
      buttons: [
        ...ShipmentsService.statuses
          .filter((st) => st.value !== s.status)
          .map((st) => ({
            text: st.label,
            handler: () => this.applyStatus(s, st.value),
          })),
        { text: 'Đóng', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async applyStatus(s: Shipment, status: ShipmentStatus) {
    if (status === 'exception' || status === 'failed') {
      await this.promptFailReason(s, status);
      return;
    }
    if (status === 'delivered' || status === 'returned' || status === 'cancelled') {
      const confirm = await this.alertCtrl.create({
        header: 'Xác nhận',
        message: `Chuyển vận đơn sang "${ShipmentsService.statusLabel(status)}"? Trạng thái kết thúc không thể đổi tiếp.`,
        buttons: [
          { text: 'Không', role: 'cancel' },
          { text: 'Đồng ý', handler: () => this.doUpdateStatus(s.id, status) },
        ],
      });
      await confirm.present();
      return;
    }
    await this.doUpdateStatus(s.id, status);
  }

  /** exception/failed yêu cầu chọn lý do (lost/damaged/wrong_address/other) */
  private async promptFailReason(s: Shipment, status: ShipmentStatus) {
    const alert = await this.alertCtrl.create({
      header: status === 'exception' ? 'Lý do sự cố' : 'Lý do giao thất bại',
      inputs: [
        { name: 'reason', type: 'radio', label: 'Thất lạc', value: 'lost' },
        { name: 'reason', type: 'radio', label: 'Hư hỏng', value: 'damaged' },
        { name: 'reason', type: 'radio', label: 'Sai địa chỉ', value: 'wrong_address', checked: true },
        { name: 'reason', type: 'radio', label: 'Khác', value: 'other' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Đồng ý',
          handler: (data) => this.doUpdateStatus(s.id, status, data?.reason ?? 'other'),
        },
      ],
    });
    await alert.present();
  }

  private async doUpdateStatus(id: string, status: ShipmentStatus, failReason?: string) {
    this.busy.set(true);
    try {
      await this.shipmentsService.updateStatus(id, status, undefined, null, failReason ?? null);
      this.toast(`Đã chuyển sang "${ShipmentsService.statusLabel(status)}"`);
      await this.load();
    } catch (e: any) {
      this.toast(e?.message ?? 'Đổi trạng thái thất bại', 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  async confirmCancel() {
    const s = this.shipment();
    if (!s) return;
    const alert = await this.alertCtrl.create({
      header: 'Hủy vận đơn',
      message: `Bạn có chắc muốn hủy vận đơn ${s.tracking_code}?`,
      buttons: [
        { text: 'Không', role: 'cancel' },
        {
          text: 'Hủy vận đơn',
          role: 'destructive',
          handler: () => this.doUpdateStatus(s.id, 'cancelled'),
        },
      ],
    });
    await alert.present();
  }

  async confirmDelete() {
    const s = this.shipment();
    if (!s) return;
    const alert = await this.alertCtrl.create({
      header: 'Xóa vận đơn',
      message: `Xóa vận đơn ${s.tracking_code}? Lịch sử vận chuyển cũng sẽ bị xóa.`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: async () => {
            this.busy.set(true);
            try {
              await this.shipmentsService.remove(s.id);
              this.toast('Đã xóa vận đơn');
              this.router.navigateByUrl('/shipments', { replaceUrl: true });
            } catch (e: any) {
              this.toast(e?.message ?? 'Xóa thất bại', 'danger');
            } finally {
              this.busy.set(false);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  // ================= Hiển thị =================

  dimsText(s: Shipment): string {
    const dims = [s.length_cm, s.width_cm, s.height_cm].filter(Boolean);
    return dims.length ? ` · ${dims.join('×')}cm` : '';
  }

  statusLabel(s: string): string {
    return ShipmentsService.statusLabel(s);
  }

  statusColor(s: string): string {
    return ShipmentsService.statusColor(s);
  }

  providerLabel(p: string | null | undefined): string {
    return this.shipmentsService.providerLabel(p);
  }

  failReasonLabel(r: string | null | undefined): string {
    switch (r) {
      case 'lost':
        return 'Thất lạc';
      case 'damaged':
        return 'Hư hỏng';
      case 'wrong_address':
        return 'Sai địa chỉ';
      case 'other':
        return 'Khác';
      default:
        return r ?? '—';
    }
  }

  money(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v ?? 0))) + ' ₫';
  }

  fmtDateTime(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

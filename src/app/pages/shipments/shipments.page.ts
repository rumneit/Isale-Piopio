import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonSearchbar,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonMenuButton,
  IonBadge,
  IonSelect,
  IonSelectOption,
  ActionSheetController,
  AlertController,
  ToastController,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  homeOutline,
  add,
  closeOutline,
  searchOutline,
  cubeOutline,
  printOutline,
  banOutline,
  documentTextOutline,
  ellipsisHorizontal,
} from 'ionicons/icons';
import { FormsModule } from '@angular/forms';
import { FabTrioComponent } from '../../shared/fab-trio/fab-trio.component';
import { ShipmentsService } from '../../core/services/shipments.service';
import { ShippingPartnersService, ShippingPartner } from '../../core/services/shipping-partners.service';
import { AuthService } from '../../core/services/auth.service';
import { Shipment } from '../../core/models/models';
import { ShipmentFormModal } from './shipment-form.modal';
import { printShipmentA6Label } from './shipment-label.print';

@Component({
  selector: 'app-shipments',
  templateUrl: './shipments.page.html',
  styleUrls: ['./shipments.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSearchbar,
    IonRefresher,
    IonRefresherContent,
    IonSpinner,
    IonMenuButton,
    IonBadge,
    IonSelect,
    IonSelectOption,
    FabTrioComponent,
    FormsModule,
  ],
})
export class ShipmentsPage implements OnInit, OnDestroy {
  readonly shipmentsService = inject(ShipmentsService);
  /** Danh sách trạng thái cho bộ lọc (static của service) */
  readonly statuses = ShipmentsService.statuses;
  private partnersService = inject(ShippingPartnersService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private actionSheetCtrl = inject(ActionSheetController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private modalCtrl = inject(ModalController);

  readonly loading = signal(true);
  readonly items = signal<Shipment[]>([]);
  readonly partners = signal<ShippingPartner[]>([]);
  readonly searchVisible = signal(false);
  search = '';
  partnerFilter = 'all';
  statusFilter = 'all';

  private unsubscribeRealtime: (() => void) | null = null;

  constructor() {
    addIcons({
      homeOutline,
      add,
      closeOutline,
      searchOutline,
      cubeOutline,
      printOutline,
      banOutline,
      documentTextOutline,
      ellipsisHorizontal,
    });
  }

  ngOnInit(): void {
    this.load();
    this.partnersService
      .list()
      .then((p) => this.partners.set(p))
      .catch(() => undefined);
    // Badge tự cập nhật khi trạng thái đổi (P2 webhook / thiết bị khác)
    this.unsubscribeRealtime = this.shipmentsService.subscribeChanges(() => {
      if (!this.loading()) this.load();
    });
  }

  ngOnDestroy(): void {
    this.unsubscribeRealtime?.();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.shipmentsService.list(this.search, this.partnerFilter, this.statusFilter));
    } catch (e: any) {
      console.error('load shipments failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async onSearch(ev: CustomEvent) {
    this.search = (ev.detail as any).value ?? '';
    await this.load();
  }

  toggleSearch() {
    this.searchVisible.update((v) => !v);
    if (!this.searchVisible()) {
      this.search = '';
      this.load();
    }
  }

  onPartnerFilter(ev: CustomEvent) {
    this.partnerFilter = (ev.detail as any).value ?? 'all';
    this.load();
  }

  onStatusFilter(ev: CustomEvent) {
    this.statusFilter = (ev.detail as any).value ?? 'all';
    this.load();
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  // ================= Điều hướng =================

  openHome() {
    this.router.navigateByUrl('/home');
  }

  openDetail(s: Shipment) {
    this.router.navigateByUrl(`/shipments/detail/${s.id}`);
  }

  // ================= Tạo mới =================

  async openAdd() {
    if (this.shipmentsService.migrationNeeded()) {
      this.alertNeedMigration();
      return;
    }
    const modal = await this.modalCtrl.create({
      component: ShipmentFormModal,
    });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'save') await this.load();
  }

  // ================= Hành động nhanh trên card =================

  async openItemActions(ev: Event, s: Shipment) {
    ev.stopPropagation();
    const sheet = await this.actionSheetCtrl.create({
      header: s.tracking_code,
      buttons: [
        { text: 'Xem chi tiết', icon: 'document-text-outline', handler: () => this.openDetail(s) },
        { text: 'In vận đơn', icon: 'print-outline', handler: () => this.printLabel(s) },
        ...(ShipmentsService.canCancel(s.status)
          ? [
              {
                text: 'Hủy vận đơn',
                icon: 'ban-outline',
                role: 'destructive',
                handler: () => this.confirmCancel(s),
              },
            ]
          : []),
        { text: 'Đóng', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  /** Hỏi in bản PDF hãng (nếu có) hay template A6 tự render */
  printLabel(s: Shipment) {
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

  // ================= Hủy vận đơn =================

  async confirmCancel(s: Shipment) {
    const alert = await this.alertCtrl.create({
      header: 'Hủy vận đơn',
      message: `Bạn có chắc muốn hủy vận đơn ${s.tracking_code}?`,
      buttons: [
        { text: 'Không', role: 'cancel' },
        {
          text: 'Hủy vận đơn',
          role: 'destructive',
          handler: async () => {
            try {
              await this.shipmentsService.cancel(s.id);
              this.toast('Đã hủy vận đơn');
              await this.load();
            } catch (e: any) {
              this.toast(e?.message ?? 'Hủy thất bại', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private alertNeedMigration() {
    this.alertCtrl
      .create({
        header: 'Cần nâng cấp dữ liệu',
        message:
          'Bảng vận đơn chưa tồn tại. Hãy chạy supabase-migration-v25.sql trong Supabase SQL Editor, sau đó tải lại trang.',
        buttons: ['Đã hiểu'],
      })
      .then((a) => a.present());
  }

  // ================= Hiển thị =================

  statusLabel(s: string): string {
    return ShipmentsService.statusLabel(s);
  }

  statusColor(s: string): string {
    return ShipmentsService.statusColor(s);
  }

  money(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v ?? 0))) + '₫';
  }

  fmtDate(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

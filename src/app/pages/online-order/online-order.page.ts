import { Component, OnInit, inject, signal, computed } from '@angular/core';
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
  IonSpinner,
  IonMenuButton,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonNote,
  IonSearchbar,
  ActionSheetController,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { homeOutline, funnelOutline, fileTrayOutline, searchOutline, closeOutline, cubeOutline, swapVerticalOutline, createOutline, trashOutline, callOutline } from 'ionicons/icons';
import { OrdersService } from '../../core/services/orders.service';
import { SalesChannelsService } from '../../core/services/sales-channels.service';
import { Order } from '../../core/models/models';

interface MonthTab {
  label: string;
  year: number;
  month: number;
}

@Component({
  selector: 'app-online-order',
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
    IonMenuButton,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonNote,
    IonSearchbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button menu="app-menu" auto-hide="false" />
          <ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button>
        </ion-buttons>
        <ion-title>Đơn từ Website</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <div class="month-tabs">
          @for (m of monthTabs; track m.label; let i = $index) {
            <button class="month-tab" [class.active]="selectedMonth() === i" (click)="selectMonth(i)">{{ m.label }}</button>
          }
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <div class="app-page-container">
        @if (searchVisible()) {
          <ion-searchbar placeholder="Tìm kiếm đơn hàng" [debounce]="300" (ionInput)="onSearch($any($event))" />
        }

        <div class="online-toolbar">
          <ion-button fill="clear" size="small" (click)="toggleSearch()">
            <ion-icon slot="icon-only" name="search-outline" />
          </ion-button>
          <button class="funnel-btn" [class.active]="statusFilter() !== 'all'" (click)="openStatusFilter()">
            <ion-icon name="funnel-outline" />
            @if (statusFilter() !== 'all') {
              <span>{{ statusLabel(statusFilter()) }}</span>
            }
          </button>
          <span class="online-total">Tổng: {{ formatMoney(total()) }}</span>
          <span class="online-count">{{ items().length }} đơn hàng</span>
        </div>

        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else if (items().length === 0) {
          <div class="app-empty online-empty">
            <div><ion-icon name="file-tray-outline" /></div>
            <span>
              Không có đơn đặt từ web nào. Chú ý các đơn này sẽ được đặt bởi khách truy cập vào website của bạn
              (kênh <b>Online / Website</b> hoặc đơn ở trạng thái Chờ xử lý),
              không thể sửa được, bạn chỉ có thể <b>Chuyển đổi sang đơn thường</b> để ghi nhận doanh thu.
            </span>
          </div>
        } @else {
          <div class="app-card">
            <ion-list lines="full">
              @for (o of items(); track o.id) {
                <ion-item button detail="true" (click)="openRowSheet(o)">
                  <ion-label>
                    <h3>{{ o.code }} — {{ o.customer_name ?? 'Khách web' }}</h3>
                    <p>
                      {{ o.created_at | date: 'HH:mm dd/MM' }}
                      @if (o.customer_phone) {
                        · <ion-icon name="call-outline" class="phone-ic" /> {{ o.customer_phone }}
                      }
                    </p>
                  </ion-label>
                  <div class="row-end" slot="end">
                    <ion-badge [color]="statusColor(o.status)">{{ statusLabel(o.status) }}</ion-badge>
                    <ion-badge color="primary">{{ formatMoney(o.total) }}</ion-badge>
                  </div>
                </ion-item>
              }
            </ion-list>
          </div>
          <ion-note class="online-hint">Đơn web không thể sửa nội dung — bấm một dòng để xem chi tiết, chuyển đổi sang đơn thường hoặc xóa.</ion-note>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .month-tabs { display: flex; gap: 8px; overflow-x: auto; padding: 6px 12px; scrollbar-width: none; }
    .month-tabs::-webkit-scrollbar { display: none; }
    .month-tab { flex-shrink: 0; background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 999px; padding: 7px 14px; font-size: 12.5px; font-weight: 700; color: var(--app-text-muted); cursor: pointer; }
    .month-tab.active { background: rgba(var(--ion-color-primary-rgb), 0.12); border-color: var(--ion-color-primary); color: var(--ion-color-primary); }
    .online-toolbar { display: flex; align-items: center; gap: 6px; padding: 2px 0 10px; color: var(--app-text-muted); flex-wrap: wrap; }
    .funnel-btn { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; color: var(--ion-color-primary); font-size: 12.5px; font-weight: 700; cursor: pointer; padding: 6px; }
    .funnel-btn.active { color: var(--ion-color-danger); }
    .online-total { font-size: 13px; font-weight: 700; color: var(--app-text); margin-left: 4px; }
    .online-count { font-size: 12.5px; font-weight: 600; color: var(--app-text-muted); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .online-empty span { display: block; line-height: 1.55; max-width: 520px; margin: 0 auto; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; display: flex; align-items: center; gap: 4px; }
    .phone-ic { font-size: 12px; vertical-align: middle; }
    .row-end { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
    .online-hint { display: block; text-align: center; font-size: 12px; padding: 6px; }
  `],
})
export class OnlineOrderPage implements OnInit {
  private ordersService = inject(OrdersService);
  private channelsService = inject(SalesChannelsService);
  private router = inject(Router);
  private actionSheetCtrl = inject(ActionSheetController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly loading = signal(true);
  readonly allItems = signal<Order[]>([]);
  readonly selectedMonth = signal(1);
  readonly monthTabs: MonthTab[] = this.buildMonthTabs();
  readonly searchVisible = signal(false);
  search = '';
  /** 'all' hoặc một trạng thái bất kỳ (funnel như ISale) */
  readonly statusFilter = signal<string>('all');
  /** Id các kênh loại Online/Website — đơn gán kênh này coi như đơn web */
  private onlineChannelIds = new Set<string>();

  constructor() {
    addIcons({ homeOutline, funnelOutline, fileTrayOutline, searchOutline, closeOutline, cubeOutline, swapVerticalOutline, createOutline, trashOutline, callOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  private buildMonthTabs(): MonthTab[] {
    const tabs: MonthTab[] = [];
    const now = new Date();
    for (let i = -1; i <= 1; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      tabs.push({
        label: `Tháng ${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
      });
    }
    return tabs;
  }

  readonly items = computed(() => {
    const tab = this.monthTabs[this.selectedMonth()];
    const q = this.search.trim().toLowerCase();
    return this.allItems().filter((o) => {
      if (!this.isWebOrder(o)) return false;
      const d = new Date(o.created_at);
      if (d.getFullYear() !== tab.year || d.getMonth() + 1 !== tab.month) return false;
      if (this.statusFilter() !== 'all' && o.status !== this.statusFilter()) return false;
      if (q) {
        const hay = `${o.code ?? ''} ${o.customer_name ?? ''} ${o.customer_phone ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  readonly total = computed(() => this.items().reduce((s, o) => s + Number(o.total ?? 0), 0));

  /** Đơn web = gán kênh loại Online/Website, hoặc đang Chờ xử lý (chờ chuyển đổi) — như ISale, đơn đã chuyển đổi vẫn nằm trong danh sách */
  private isWebOrder(o: Order): boolean {
    if (o.channel_id && this.onlineChannelIds.has(o.channel_id)) return true;
    return o.status === 'pending';
  }

  async load() {
    this.loading.set(true);
    try {
      const [orders, channels] = await Promise.all([
        this.ordersService.list(),
        this.channelsService.list().catch(() => []),
      ]);
      this.onlineChannelIds = new Set(channels.filter((c) => c.type === 'online').map((c) => c.id));
      this.allItems.set(orders);
    } catch (e) {
      console.error('load online orders failed', e);
      this.allItems.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  selectMonth(i: number) {
    this.selectedMonth.set(i);
  }

  toggleSearch() {
    this.searchVisible.update((v) => !v);
    if (!this.searchVisible()) {
      this.search = '';
    }
  }

  onSearch(ev: CustomEvent) {
    this.search = (ev.detail as any).value ?? '';
  }

  openStatusFilter() {
    const buttons = OrdersService.orderStatuses.map((s) => ({
      text: (this.statusFilter() === s.value ? '✓ ' : '') + s.label,
      handler: () => this.statusFilter.set(s.value),
    }));
    this.actionSheetCtrl
      .create({
        header: 'Lọc theo trạng thái',
        buttons: [
          ...buttons,
          { text: 'Tất cả trạng thái', handler: () => this.statusFilter.set('all') },
          { text: 'Đóng', role: 'cancel' },
        ],
      })
      .then((s) => s.present());
  }

  /** Hành động trên 1 đơn web — như ISale: không sửa nội dung, chỉ xem/chuyển đổi/xóa */
  async openRowSheet(o: Order) {
    const converted = o.status !== 'pending';
    const sheet = await this.actionSheetCtrl.create({
      header: `${o.code} — ${this.formatMoney(o.total)}`,
      buttons: [
        { text: 'Xem chi tiết', icon: 'cube-outline', handler: () => this.openDetail(o) },
        {
          text: converted ? 'Đã chuyển đổi — về Nháp để xử lý lại' : 'Chuyển đổi sang đơn thường',
          icon: 'swap-vertical-outline',
          handler: () => this.convertOrder(o),
        },
        { text: 'Xóa đơn web', icon: 'trash-outline', role: 'destructive', handler: () => this.deleteOrder(o) },
        { text: 'Đóng', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  openDetail(o: Order) {
    this.router.navigateByUrl(`/order/${o.id}`);
  }

  /** Chuyển đổi sang đơn thường: đưa đơn ra khỏi hàng chờ web để ghi nhận doanh thu (giữ nguyên dữ liệu) */
  private async convertOrder(o: Order) {
    const alert = await this.alertCtrl.create({
      header: 'Chuyển đổi sang đơn thường',
      message: `Chuyển ${o.code} sang đơn thường để ghi nhận doanh thu? Đơn sẽ xuất hiện trong Quản lý đơn hàng.`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Chuyển đổi',
          handler: async () => {
            try {
              await this.ordersService.update(o.id, { status: 'draft' });
              this.toast(`Đã chuyển ${o.code} sang đơn thường`);
              await this.load();
            } catch (e: any) {
              this.toast(e?.message ?? 'Chuyển đổi thất bại', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private async deleteOrder(o: Order) {
    const alert = await this.alertCtrl.create({
      header: 'Xác nhận',
      message: `Xóa đơn web ${o.code}? Hành động này không thể hoàn tác.`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Đồng ý',
          role: 'destructive',
          handler: async () => {
            try {
              await this.ordersService.remove(o.id);
              this.toast('Đã xóa đơn web');
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

  openHome() {
    this.router.navigateByUrl('/home');
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  statusLabel(status: string | null | undefined): string {
    return OrdersService.statusLabel(status);
  }

  statusColor(status: string | null | undefined): string {
    return OrdersService.statusColor(status);
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 2200, color, position: 'bottom' });
    await t.present();
  }
}

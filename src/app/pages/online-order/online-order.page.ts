import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
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
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { homeOutline, funnelOutline, fileTrayOutline } from 'ionicons/icons';
import { OrdersService } from '../../core/services/orders.service';
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
        <div class="online-toolbar">
          <ion-icon name="funnel-outline" />
          <span class="online-total">Tổng: {{ formatMoney(total()) }}</span>
        </div>

        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else if (items().length === 0) {
          <div class="app-empty online-empty">
            <div><ion-icon name="file-tray-outline" /></div>
            <span>
              Không có đơn đặt từ web nào. Các đơn này do khách truy cập website của bạn đặt,
              không thể sửa được — bạn chỉ có thể chuyển đổi sang đơn thường để ghi nhận doanh thu.
            </span>
          </div>
        } @else {
          <div class="app-card">
            <ion-list lines="full">
              @for (o of items(); track o.id) {
                <ion-item>
                  <ion-label>
                    <h3>{{ o.code }} — {{ o.customer_name ?? 'Khách web' }}</h3>
                    <p>{{ o.created_at | date: 'HH:mm dd/MM' }}</p>
                  </ion-label>
                  <ion-badge slot="end" color="primary">{{ formatMoney(o.total) }}</ion-badge>
                </ion-item>
              }
            </ion-list>
          </div>
          <ion-note class="online-hint">Nhấn một dòng để chuyển thành đơn thường (ghi nhận doanh thu).</ion-note>
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
    .online-toolbar { display: flex; align-items: center; gap: 8px; padding: 2px 0 10px; color: var(--app-text-muted); }
    .online-total { font-size: 13px; font-weight: 700; color: var(--app-text); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .online-empty span { display: block; line-height: 1.55; max-width: 520px; margin: 0 auto; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
    .online-hint { display: block; text-align: center; font-size: 12px; padding: 6px; }
  `],
})
export class OnlineOrderPage implements OnInit {
  private ordersService = inject(OrdersService);

  readonly loading = signal(true);
  readonly allItems = signal<Order[]>([]);
  readonly selectedMonth = signal(1);
  readonly monthTabs: MonthTab[] = this.buildMonthTabs();

  constructor() {
    addIcons({ homeOutline, funnelOutline, fileTrayOutline });
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
    return this.allItems().filter((o) => {
      if (o.status !== 'pending') return false;
      const d = new Date(o.created_at);
      return d.getFullYear() === tab.year && d.getMonth() + 1 === tab.month;
    });
  });

  readonly total = computed(() => this.items().reduce((s, o) => s + Number(o.total ?? 0), 0));

  async load() {
    this.loading.set(true);
    try {
      this.allItems.set(await this.ordersService.list());
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

  openHome() {
    window.location.hash = '#/home';
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}

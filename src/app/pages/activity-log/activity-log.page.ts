import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonRefresher, IonRefresherContent,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  flashOutline, addCircleOutline, createOutline, trashOutline, pricetagsOutline,
  cartOutline, peopleOutline, swapHorizontalOutline,
} from 'ionicons/icons';
import { LogService, ActivityLog } from '../../core/services/log.service';

@Component({
  selector: 'app-activity-log',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote,
    IonRefresher, IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /></ion-buttons>
        <ion-title>Lịch sử thay đổi</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($any($event))">
        <ion-refresher-content />
      </ion-refresher>

      <div class="app-page-container">
        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else if (items().length === 0) {
          <div class="app-empty">
            <div><ion-icon name="flash-outline" /></div>
            Chưa có hoạt động nào được ghi nhận
          </div>
        } @else {
          <div class="app-card">
            <ion-list lines="full">
              @for (log of items(); track log.id) {
                <ion-item>
                  <div class="log-icon" slot="start" [class]="'log-' + log.action">
                    <ion-icon [name]="iconFor(log.action)" />
                  </div>
                  <ion-label>
                    <h3>{{ entityLabel(log.entity) }}: {{ log.entity_label }}</h3>
                    <p>{{ log.user_name }} · {{ log.created_at | date: 'dd/MM HH:mm' }}</p>
                  </ion-label>
                  <ion-badge slot="end" [color]="badgeColor(log.action)">{{ actionLabel(log.action) }}</ion-badge>
                </ion-item>
              }
            </ion-list>
          </div>
          <ion-note class="page-hint">Ghi nhận tự động khi có thay đổi sản phẩm, đơn hàng, khách hàng, giao dịch</ion-note>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .log-icon { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
    .log-create { background: rgba(45, 213, 91, 0.12); color: var(--ion-color-success); }
    .log-update { background: rgba(255, 180, 0, 0.14); color: var(--ion-color-warning); }
    .log-delete { background: rgba(197, 0, 15, 0.1); color: var(--ion-color-danger); }
    .log-icon ion-icon { font-size: 19px; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 4px; }
  `],
})
export class ActivityLogPage implements OnInit {
  readonly logService = inject(LogService);

  readonly items = signal<ActivityLog[]>([]);
  readonly loading = signal(true);

  constructor() {
    addIcons({
      flashOutline, addCircleOutline, createOutline, trashOutline, pricetagsOutline,
      cartOutline, peopleOutline, swapHorizontalOutline,
    });
  }

  ngOnInit(): void { this.load(); }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.logService.list(150));
    } catch (e: any) {
      console.error('load activity log failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  iconFor(action: string): string {
    return action === 'create' ? 'add-circle-outline' : action === 'update' ? 'create-outline' : 'trash-outline';
  }

  actionLabel(action: string): string {
    return action === 'create' ? 'Thêm' : action === 'update' ? 'Sửa' : 'Xóa';
  }

  badgeColor(action: string): string {
    return action === 'create' ? 'success' : action === 'update' ? 'warning' : 'danger';
  }

  entityLabel(entity: string): string {
    const map: Record<string, string> = {
      product: 'Sản phẩm',
      order: 'Đơn hàng',
      customer: 'Khách hàng',
      transaction: 'Giao dịch',
    };
    return map[entity] ?? entity;
  }
}

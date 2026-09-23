import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonButton, IonRefresher,
  IonRefresherContent, AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { copyOutline, trashOutline, gitMergeOutline, searchOutline } from 'ionicons/icons';
import { CustomersService } from '../../core/services/customers.service';
import { findDuplicates, DuplicateGroup, DuplicateCandidate } from '../../core/duplicate-detection';

@Component({
  selector: 'app-duplicate-customers',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonButton,
    IonRefresher, IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/contact" /></ion-buttons>
        <ion-title>Lọc khách trùng</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="scan()"><ion-icon slot="icon-only" name="search-outline" /></ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($any($event))">
        <ion-refresher-content />
      </ion-refresher>
      <div class="app-page-container">
        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else if (groups().length === 0) {
          <div class="app-empty">
            <div><ion-icon name="git-merge-outline" /></div>
            Không phát hiện khách hàng trùng lặp (đã kiểm tra {{ scanned() }} khách).
          </div>
        } @else {
          <div class="app-banner-warning">
            <ion-icon name="git-merge-outline" />
            <span>Phát hiện <b>{{ groups().length }}</b> nhóm trùng trong {{ scanned() }} khách. Giữ lại 1 khách, xóa các bản còn lại.</span>
          </div>

          @for (g of groups(); track g.key + g.reason) {
            <div class="app-card">
              <div class="dup-head">
                <ion-badge [color]="g.reason === 'phone' ? 'danger' : 'warning'">
                  {{ g.reason === 'phone' ? 'Trùng SĐT' : 'Trùng tên + thông tin' }}
                </ion-badge>
                <span class="dup-count">{{ g.items.length }} khách</span>
              </div>
              <ion-list lines="full">
                @for (c of g.items; track c.id) {
                  <ion-item>
                    <ion-label>
                      <h3>{{ c.name }}</h3>
                      <p>{{ c.phone ?? '—' }} · {{ c.email ?? '—' }}</p>
                      <p>{{ c.address ?? 'Không có địa chỉ' }}</p>
                    </ion-label>
                    <ion-button slot="end" fill="clear" color="danger" (click)="removeOne(c)">
                      <ion-icon slot="icon-only" name="trash-outline" />
                    </ion-button>
                  </ion-item>
                }
              </ion-list>
            </div>
          }
          <ion-note class="page-hint">Sau khi xóa, nhấn biểu tượng tìm kiếm để quét lại.</ion-note>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .dup-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .dup-count { font-size: 12.5px; color: var(--app-text-muted); }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 4px; }
  `],
})
export class DuplicateCustomersPage implements OnInit {
  private customersService = inject(CustomersService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly groups = signal<DuplicateGroup[]>([]);
  readonly loading = signal(true);
  readonly scanned = signal(0);

  constructor() {
    addIcons({ copyOutline, trashOutline, gitMergeOutline, searchOutline });
  }

  ngOnInit(): void {
    this.scan();
  }

  async scan() {
    this.loading.set(true);
    try {
      const customers = await this.customersService.list();
      this.scanned.set(customers.length);
      this.groups.set(findDuplicates(customers as DuplicateCandidate[]));
    } catch (e: any) {
      console.error('scan duplicates failed', e);
      this.groups.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.scan().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  async removeOne(c: DuplicateCandidate) {
    const alert = await this.alertCtrl.create({
      header: 'Xóa khách trùng',
      message: `Xóa "${c.name}" (${c.phone ?? 'không SĐT'})? Hành động không thể hoàn tác.`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: async () => {
            try {
              await this.customersService.remove(c.id);
              this.toast('Đã xóa');
              await this.scan();
            } catch (e: any) {
              this.toast(e?.message ?? 'Xóa thất bại', 'danger');
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
}

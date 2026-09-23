import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonSpinner, IonBadge, IonFab, IonFabButton, IonRefresher, IonRefresherContent,
  IonButton, IonNote, AlertController, ToastController, ActionSheetController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, restaurantOutline, createOutline, trashOutline } from 'ionicons/icons';
import { ShopTableService } from '../../core/services/shop-table.service';

interface CafeTable {
  id: string;
  name: string;
  seats: number;
  status: 'free' | 'busy' | 'reserved';
  note: string | null;
}

@Component({
  selector: 'app-cafe-tables',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent,     IonSpinner, IonBadge, IonFab, IonFabButton, IonRefresher,
    IonRefresherContent, IonButton, IonNote,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /><ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons>
        <ion-title>Quản bàn</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($any($event))">
        <ion-refresher-content />
      </ion-refresher>

      <div class="app-page-container">
        <div class="table-legend">
          <span><span class="dot dot-free"></span> Trống ({{ countBy('free') }})</span>
          <span><span class="dot dot-busy"></span> Có khách ({{ countBy('busy') }})</span>
          <span><span class="dot dot-reserved"></span> Đặt trước ({{ countBy('reserved') }})</span>
        </div>

        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else if (items().length === 0) {
          <div class="app-empty">
            <div><ion-icon name="restaurant-outline" /></div>
            Chưa có bàn nào. Nhấn + để thêm bàn.
          </div>
        } @else {
          <div class="table-grid">
            @for (t of items(); track t.id) {
              <div class="table-card" [class]="'table-' + t.status" (click)="openActions(t)">
                <ion-icon name="restaurant-outline" />
                <div class="table-name">{{ t.name }}</div>
                <div class="table-meta">{{ t.seats }} chỗ</div>
                <ion-badge [color]="statusColor(t.status)">{{ statusLabel(t.status) }}</ion-badge>
              </div>
            }
          </div>
          <ion-note class="page-hint">Nhấn vào bàn để đổi trạng thái / sửa / xóa</ion-note>
        }
      </div>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="addTable()"><ion-icon name="add-outline" /></ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .table-legend { display: flex; gap: 14px; font-size: 12px; color: var(--app-text-muted); margin-bottom: 12px; align-items: center; }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; vertical-align: -1px; }
    .dot-free { background: var(--ion-color-success); }
    .dot-busy { background: var(--ion-color-danger); }
    .dot-reserved { background: var(--ion-color-warning); }
    .table-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
    .table-card { background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 14px; padding: 14px 10px; text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .table-card.table-free { border-top: 3px solid var(--ion-color-success); }
    .table-card.table-busy { border-top: 3px solid var(--ion-color-danger); }
    .table-card.table-reserved { border-top: 3px solid var(--ion-color-warning); }
    .table-card ion-icon { font-size: 26px; color: var(--app-text-muted); }
    .table-name { font-weight: 700; font-size: 14.5px; color: var(--app-text); }
    .table-meta { font-size: 11.5px; color: var(--app-text-muted); }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 6px; }
  `],
})
export class CafeTablesPage implements OnInit {
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  readonly svc = inject(ShopTableService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private actionSheetCtrl = inject(ActionSheetController);

  readonly items = signal<CafeTable[]>([]);
  readonly loading = signal(true);

  constructor() {
    addIcons({ addOutline, restaurantOutline, createOutline, trashOutline });
  }

  ngOnInit(): void { this.load(); }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.svc.list<CafeTable>('cafe_tables', 'created_at', true));
    } catch (e: any) {
      console.error('load tables failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  countBy(status: string): number {
    return this.items().filter((t) => t.status === status).length;
  }

  statusLabel(status: string): string {
    return status === 'free' ? 'Trống' : status === 'busy' ? 'Có khách' : 'Đặt trước';
  }

  statusColor(status: string): string {
    return status === 'free' ? 'success' : status === 'busy' ? 'danger' : 'warning';
  }

  async openActions(table: CafeTable) {
    const sheet = await this.actionSheetCtrl.create({
      header: `${table.name} — ${this.statusLabel(table.status)}`,
      buttons: [
        ...(['free', 'busy', 'reserved'] as const)
          .filter((s) => s !== table.status)
          .map((s) => ({
            text: `Chuyển sang: ${this.statusLabel(s)}`,
            handler: async () => {
              try {
                await this.svc.update('cafe_tables', table.id, { status: s });
                await this.load();
              } catch (e: any) {
                this.toast(e?.message ?? 'Thất bại', 'danger');
              }
            },
          })),
        { text: 'Sửa bàn', icon: 'create-outline', handler: () => this.editTable(table) },
        { text: 'Xóa bàn', icon: 'trash-outline', role: 'destructive', handler: () => this.deleteTable(table) },
        { text: 'Hủy', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  async addTable() {
    await this.openForm(null);
  }

  async editTable(table: CafeTable) {
    await this.openForm(table);
  }

  private async openForm(existing: CafeTable | null) {
    const alert = await this.alertCtrl.create({
      header: existing ? 'Sửa bàn' : 'Thêm bàn',
      inputs: [
        { name: 'name', type: 'text', placeholder: 'Tên bàn *', value: existing?.name ?? '' },
        { name: 'seats', type: 'number', placeholder: 'Số chỗ', value: String(existing?.seats ?? 4) },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Lưu',
          handler: async (data) => {
            if (!data?.name?.trim()) {
              this.toast('Vui lòng nhập tên bàn', 'danger');
              return false;
            }
            try {
              const payload = { name: data.name.trim(), seats: Number(data.seats ?? 4) };
              if (existing) await this.svc.update('cafe_tables', existing.id, payload);
              else await this.svc.create('cafe_tables', payload);
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Lưu thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private async deleteTable(table: CafeTable) {
    const alert = await this.alertCtrl.create({
      header: 'Xóa bàn',
      message: `Xóa "${table.name}"?`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa', role: 'destructive',
          handler: async () => {
            try {
              await this.svc.remove('cafe_tables', table.id);
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

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

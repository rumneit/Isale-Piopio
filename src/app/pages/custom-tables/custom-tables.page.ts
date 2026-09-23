import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonFab, IonFabButton,
  IonSearchbar, IonRefresher, IonRefresherContent, AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, gridOutline, trashOutline, chevronForwardOutline } from 'ionicons/icons';
import { CustomTablesService, CustomTable, CustomTableColumn } from '../../core/services/custom-tables.service';

@Component({
  selector: 'app-custom-tables',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonFab,
    IonFabButton, IonSearchbar, IonRefresher, IonRefresherContent, RouterLink,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /></ion-buttons>
        <ion-title>Bảng dữ liệu tùy chỉnh</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar placeholder="Tìm bảng" [debounce]="300" (ionInput)="onSearch($any($event))" />
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
            <div><ion-icon name="grid-outline" /></div>
            Chưa có bảng tùy chỉnh. Nhấn + để tạo bảng với các cột riêng.
          </div>
        } @else {
          <div class="app-card">
            <ion-list lines="full">
              @for (t of items(); track t.id) {
                <ion-item button [routerLink]="['/custom-table', t.id]" detail="false">
                  <ion-icon slot="start" name="grid-outline" color="primary" />
                  <ion-label>
                    <h3>{{ t.name }}</h3>
                    <p>{{ t.columns.length }} cột: {{ columnPreview(t) }}</p>
                  </ion-label>
                  <ion-icon slot="end" name="chevron-forward-outline" color="medium" />
                </ion-item>
              }
            </ion-list>
          </div>
          <ion-note class="page-hint">Nhấn bảng để xem và nhập dữ liệu</ion-note>
        }
      </div>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="openAdd()"><ion-icon name="add-outline" /></ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 4px; }
  `],
})
export class CustomTablesPage implements OnInit {
  private service = inject(CustomTablesService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly items = signal<CustomTable[]>([]);
  readonly loading = signal(true);
  search = '';

  constructor() {
    addIcons({ addOutline, gridOutline, trashOutline, chevronForwardOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.service.list(this.search));
    } catch (e: any) {
      console.error('load custom tables failed', e);
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

  columnPreview(t: CustomTable): string {
    return t.columns.map((c) => c.label).join(', ') || '—';
  }

  /** Nhập danh sách cột dạng "Tên cột:Số, Ngày:Ngày" → định nghĩa cột. */
  private parseColumns(raw: string): CustomTableColumn[] {
    return String(raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((part) => {
        const [labelPart, typePart] = part.split(':').map((x) => x.trim());
        const typeMap: Record<string, CustomTableColumn['type']> = {
          'số': 'number',
          'so': 'number',
          'ngày': 'date',
          'ngay': 'date',
          'đúng/sai': 'boolean',
          'dung/sai': 'boolean',
        };
        return {
          key: CustomTablesService.slugifyKey(labelPart),
          label: labelPart,
          type: typeMap[(typePart ?? '').toLowerCase()] ?? 'text',
        };
      })
      .filter((c) => !!c.key);
  }

  async openAdd() {
    const alert = await this.alertCtrl.create({
      header: 'Tạo bảng tùy chỉnh',
      message: 'Nhập các cột, phân cách bằng dấu phẩy. Thêm ":Số" hoặc ":Ngày" để chọn kiểu.',
      inputs: [
        { name: 'name', type: 'text', placeholder: 'Tên bảng (VD: Lịch giao hàng)' },
        { name: 'columns', type: 'text', placeholder: 'VD: Ngày:Ngày, Tuyến, Ghi chú' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Tạo',
          handler: async (data) => {
            if (!data?.name?.trim()) {
              this.toast('Vui lòng nhập tên bảng', 'danger');
              return false;
            }
            const columns = this.parseColumns(data.columns);
            if (!columns.length) {
              this.toast('Cần ít nhất một cột hợp lệ', 'danger');
              return false;
            }
            try {
              await this.service.create(data.name.trim(), columns);
              this.toast('Đã tạo bảng');
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Tạo thất bại', 'danger');
              return false;
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

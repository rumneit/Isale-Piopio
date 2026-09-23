import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonButton,
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonFab, IonFabButton,
  IonSegment, IonSegmentButton, IonRefresher, IonRefresherContent,
  AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, optionsOutline, trashOutline, documentTextOutline } from 'ionicons/icons';
import { CustomFieldsService, CustomField, CustomFieldEntity } from '../../core/services/custom-fields.service';

@Component({
  selector: 'app-custom-fields',
  imports: [
    IonButton,
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonFab,
    IonFabButton, IonSegment, IonSegmentButton, IonRefresher, IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /><ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons>
        <ion-title>Trường tùy chỉnh</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="entity()" (ionChange)="onEntity($any($event.detail.value))">
          @for (e of service.entities; track e.value) {
            <ion-segment-button [value]="e.value">{{ e.label }}</ion-segment-button>
          }
        </ion-segment>
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
            <div><ion-icon name="options-outline" /></div>
            Chưa có trường tùy chỉnh cho mục này. Nhấn + để thêm.
          </div>
        } @else {
          <div class="app-card">
            <ion-list lines="full">
              @for (f of items(); track f.id) {
                <ion-item button (click)="openEdit(f)" detail="false">
                  <ion-icon slot="start" name="options-outline" color="primary" />
                  <ion-label>
                    <h3>{{ f.label }}</h3>
                    <p><code>{{ f.key }}</code> · {{ typeLabel(f.type) }}</p>
                  </ion-label>
                  @if (f.required) { <ion-badge slot="end" color="warning">Bắt buộc</ion-badge> }
                  <ion-badge slot="end" color="medium">{{ f.type }}</ion-badge>
                </ion-item>
              }
            </ion-list>
          </div>
          <ion-note class="page-hint">Trường tùy chỉnh cho phép thêm dữ liệu riêng cho từng mục</ion-note>
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
    code { background: var(--app-surface-alt); padding: 1px 5px; border-radius: 4px; }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 4px; }
  `],
})
export class CustomFieldsPage implements OnInit {
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  readonly service = inject(CustomFieldsService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly items = signal<CustomField[]>([]);
  readonly loading = signal(true);
  readonly entity = signal<CustomFieldEntity>('customer');

  constructor() {
    addIcons({ addOutline, optionsOutline, trashOutline, documentTextOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.service.list(this.entity()));
    } catch (e: any) {
      console.error('load custom fields failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async onEntity(value: any) {
    this.entity.set(value);
    await this.load();
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  typeLabel(type: string): string {
    return this.service.fieldTypes.find((t) => t.value === type)?.label ?? type;
  }

  async openAdd() {
    const alert = await this.alertCtrl.create({
      header: 'Thêm trường tùy chỉnh',
      inputs: [
        { name: 'label', type: 'text', placeholder: 'Nhãn (VD: Mã số thuế)' },
        { name: 'key', type: 'text', placeholder: 'Key (tự sinh nếu để trống)' },
        {
          name: 'type',
          type: 'radio',
          label: 'Văn bản',
          value: 'text',
          checked: true,
        },
        { name: 'type', type: 'radio', label: 'Số', value: 'number' },
        { name: 'type', type: 'radio', label: 'Ngày', value: 'date' },
        { name: 'type', type: 'radio', label: 'Danh sách chọn', value: 'select' },
        { name: 'type', type: 'radio', label: 'Đúng/Sai', value: 'boolean' },
        { name: 'options', type: 'text', placeholder: 'Tùy chọn (phân cách dấu phẩy, cho loại chọn)' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Thêm',
          handler: async (data) => {
            if (!data?.label?.trim()) {
              this.toast('Vui lòng nhập nhãn', 'danger');
              return false;
            }
            const key = (data.key?.trim() || CustomFieldsService.slugifyKey(data.label)).toLowerCase();
            if (!key) {
              this.toast('Key không hợp lệ', 'danger');
              return false;
            }
            const options = String(data.options ?? '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            try {
              await this.service.create({
                entity: this.entity(),
                key,
                label: data.label.trim(),
                type: data.type ?? 'text',
                options,
                required: false,
                sort_order: this.items().length,
              });
              this.toast('Đã thêm trường');
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Thêm thất bại (có thể key bị trùng)', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async openEdit(f: CustomField) {
    const alert = await this.alertCtrl.create({
      header: 'Sửa trường',
      inputs: [
        { name: 'label', type: 'text', value: f.label },
        { name: 'options', type: 'text', value: f.options.join(', '), placeholder: 'Tùy chọn (phân cách dấu phẩy)' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: async () => {
            try {
              await this.service.remove(f.id);
              this.toast('Đã xóa trường');
              await this.load();
            } catch (e: any) {
              this.toast(e?.message ?? 'Xóa thất bại', 'danger');
            }
            return true;
          },
        },
        {
          text: 'Lưu',
          handler: async (data) => {
            if (!data?.label?.trim()) {
              this.toast('Nhãn không được trống', 'danger');
              return false;
            }
            try {
              await this.service.update(f.id, {
                label: data.label.trim(),
                options: String(data.options ?? '')
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              });
              this.toast('Đã lưu');
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

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonFab, IonFabButton,
  IonButton, IonRefresher, IonRefresherContent, AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, keyOutline, copyOutline, banOutline, trashOutline } from 'ionicons/icons';
import { ApiTokensService, ApiToken } from '../../core/services/api-tokens.service';

@Component({
  selector: 'app-external-api',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonFab,
    IonFabButton, IonButton, IonRefresher, IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/integrations" /></ion-buttons>
        <ion-title>API cho hệ thống ngoài</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($any($event))">
        <ion-refresher-content />
      </ion-refresher>
      <div class="app-page-container">
        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else {
          <div class="app-banner-warning">
            <ion-icon name="key-outline" />
            <span>Tạo token để hệ thống ngoài (website, POS khác) gọi API. Giữ token bí mật.</span>
          </div>

          @if (items().length === 0) {
            <div class="app-empty">
              <div><ion-icon name="key-outline" /></div>
              Chưa có token nào. Nhấn + để tạo token đầu tiên.
            </div>
          } @else {
            <div class="app-card">
              <ion-list lines="full">
                @for (t of items(); track t.id) {
                  <ion-item>
                    <ion-icon slot="start" name="key-outline" [color]="t.revoked ? 'medium' : 'primary'" />
                    <ion-label>
                      <h3>{{ t.name }}</h3>
                      <p class="mono">{{ mask(t.token) }}</p>
                      <p>Phạm vi: {{ t.scopes }} · dùng lần cuối: {{ t.last_used_at ? (t.last_used_at | date: 'dd/MM HH:mm') : 'chưa' }}</p>
                    </ion-label>
                    @if (t.revoked) {
                      <ion-badge slot="end" color="medium">Đã thu hồi</ion-badge>
                    } @else {
                      <ion-button slot="end" fill="clear" (click)="copy(t)">
                        <ion-icon slot="icon-only" name="copy-outline" />
                      </ion-button>
                      <ion-button slot="end" fill="clear" color="warning" (click)="revoke(t)">
                        <ion-icon slot="icon-only" name="ban-outline" />
                      </ion-button>
                    }
                    <ion-button slot="end" fill="clear" color="danger" (click)="remove(t)">
                      <ion-icon slot="icon-only" name="trash-outline" />
                    </ion-button>
                  </ion-item>
                }
              </ion-list>
            </div>
          }
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
    .mono { font-family: monospace; }
  `],
})
export class ExternalApiPage implements OnInit {
  private service = inject(ApiTokensService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly items = signal<ApiToken[]>([]);
  readonly loading = signal(true);

  constructor() {
    addIcons({ addOutline, keyOutline, copyOutline, banOutline, trashOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.service.list());
    } catch (e: any) {
      console.error('load api tokens failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  mask(token: string): string {
    if (token.length <= 14) return token;
    return token.slice(0, 10) + '••••••••' + token.slice(-4);
  }

  async openAdd() {
    const alert = await this.alertCtrl.create({
      header: 'Tạo API token',
      inputs: [
        { name: 'name', type: 'text', placeholder: 'Tên (VD: Website bán hàng)' },
        { name: 'scopes', type: 'text', placeholder: 'Phạm vi (read / read,write)', value: 'read' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Tạo',
          handler: async (data) => {
            if (!data?.name?.trim()) {
              this.toast('Vui lòng nhập tên token', 'danger');
              return false;
            }
            try {
              const created = await this.service.create(data.name.trim(), data.scopes?.trim() || 'read');
              await this.load();
              await this.showToken(created.token);
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

  private async showToken(token: string) {
    const alert = await this.alertCtrl.create({
      header: 'Token của bạn',
      subHeader: 'Sao chép ngay — token sẽ không hiển thị đầy đủ lần sau.',
      message: token,
      buttons: [
        { text: 'Sao chép', handler: () => this.copyText(token) },
        { text: 'Đóng', role: 'cancel' },
      ],
    });
    await alert.present();
  }

  async copy(t: ApiToken) {
    await this.copyText(t.token);
  }

  private async copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast('Đã sao chép token');
    } catch {
      this.toast('Không sao chép được — hãy chọn thủ công', 'warning');
    }
  }

  async revoke(t: ApiToken) {
    const alert = await this.alertCtrl.create({
      header: 'Thu hồi token',
      message: `Thu hồi token "${t.name}"? Hệ thống ngoài sẽ ngừng truy cập.`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Thu hồi',
          role: 'destructive',
          handler: async () => {
            try {
              await this.service.revoke(t.id);
              this.toast('Đã thu hồi');
              await this.load();
            } catch (e: any) {
              this.toast(e?.message ?? 'Thất bại', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async remove(t: ApiToken) {
    const alert = await this.alertCtrl.create({
      header: 'Xóa token',
      message: `Xóa vĩnh viễn token "${t.name}"?`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: async () => {
            try {
              await this.service.remove(t.id);
              this.toast('Đã xóa');
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

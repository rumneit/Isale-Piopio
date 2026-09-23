import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonSpinner, IonNote, IonButton, IonCard, IonCardHeader,
  IonCardTitle, IonCardContent, IonRefresher, IonRefresherContent, IonBadge,
  AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline, sparklesOutline, informationCircleOutline, flashOutline,
  cashOutline, constructOutline, gridOutline, trashOutline, chevronForwardOutline,
} from 'ionicons/icons';
import { AiPagesService, AiPage } from '../../core/services/ai-pages.service';
import { AI_PAGE_TEMPLATES, buildConfig } from '../../core/ai-pages';

/**
 * "Tạo trang với AI" (khớp /ai-dynamic-page của mẫu).
 *
 * Trung thực về phạm vi: phần sinh cấu hình từ câu chat cần backend gọi mô hình
 * AI (giữ API key). Ở đây cung cấp THƯ VIỆN MẪU trang dựng sẵn — người dùng chọn
 * mẫu, hệ thống tạo trang và hiển thị SỐ LIỆU THẬT từ dữ liệu shop.
 */
@Component({
  selector: 'app-ai-dynamic-page',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonSpinner, IonNote, IonButton, IonCard,
    IonCardHeader, IonCardTitle, IonCardContent, IonRefresher, IonRefresherContent, IonBadge,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /></ion-buttons>
        <ion-title>Tạo trang với AI</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($any($event))">
        <ion-refresher-content />
      </ion-refresher>
      <div class="app-page-container">
        <div class="app-banner-warning">
          <ion-icon name="information-circle-outline" />
          <span>
            Chọn mẫu trang bên dưới để tạo trang báo cáo. Trang hiển thị số liệu THẬT từ
            đơn hàng / khách hàng / sản phẩm của shop, không bị tính phí AI khi xem.
          </span>
        </div>

        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else {
          @if (pages().length > 0) {
            <div class="app-card-title"><h4>Trang của bạn</h4></div>
            <div class="app-card">
              <ion-list lines="full">
                @for (p of pages(); track p.id) {
                  <ion-item button (click)="open(p)" detail="false">
                    <ion-icon slot="start" name="grid-outline" color="primary" />
                    <ion-label>
                      <h3>{{ p.name }}</h3>
                      <p>{{ p.config?.widgets?.length ?? 0 }} khối dữ liệu</p>
                    </ion-label>
                    <ion-icon slot="end" name="chevron-forward-outline" color="medium" />
                  </ion-item>
                }
              </ion-list>
            </div>
          }

          <div class="app-card-title"><h4>Thư viện mẫu trang</h4></div>
          @for (t of templates; track t.key) {
            <ion-card class="tpl-card">
              <ion-card-header>
                <ion-card-title>
                  <ion-icon name="sparkles-outline" color="primary" /> {{ t.name }}
                </ion-card-title>
              </ion-card-header>
              <ion-card-content>
                <p>{{ t.description }}</p>
                <p class="tpl-prompt">"{{ t.prompt }}"</p>
                <ion-button size="small" (click)="createFromTemplate(t.key, t.name)">
                  <ion-icon slot="start" name="add-outline" /> Tạo trang
                </ion-button>
              </ion-card-content>
            </ion-card>
          }

          <div class="app-card">
            <div class="app-card-title"><h4>Tiện ích</h4></div>
            <ion-list lines="full">
              <ion-item>
                <ion-icon slot="start" name="flash-outline" color="warning" />
                <ion-label>Trang được lưu và mở lại bất cứ lúc nào</ion-label>
              </ion-item>
              <ion-item>
                <ion-icon slot="start" name="construct-outline" color="primary" />
                <ion-label>Dữ liệu luôn cập nhật theo dữ liệu shop</ion-label>
              </ion-item>
              <ion-item>
                <ion-icon slot="start" name="cash-outline" color="success" />
                <ion-label>Xem trang không bị tính phí AI</ion-label>
              </ion-item>
            </ion-list>
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
    .app-card-title { margin: 14px 2px 8px; }
    .app-card-title h4 { margin: 0; font-size: 15px; font-weight: 800; color: var(--app-text); }
    .tpl-card { border-radius: var(--app-radius); box-shadow: var(--app-shadow-sm); margin: 0 0 12px; }
    .tpl-card ion-card-title { font-size: 15px; display: flex; align-items: center; gap: 6px; }
    .tpl-card p { font-size: 13px; color: var(--app-text-muted); margin: 0 0 8px; }
    .tpl-prompt { font-style: italic; opacity: 0.85; }
  `],
})
export class AiDynamicPage implements OnInit {
  private service = inject(AiPagesService);
  private router = inject(Router);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly pages = signal<AiPage[]>([]);
  readonly loading = signal(true);
  readonly templates = AI_PAGE_TEMPLATES;

  constructor() {
    addIcons({
      addOutline, sparklesOutline, informationCircleOutline, flashOutline,
      cashOutline, constructOutline, gridOutline, trashOutline, chevronForwardOutline,
    });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.pages.set(await this.service.list());
    } catch (e: any) {
      console.error('load ai pages failed', e);
      this.pages.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  async createFromTemplate(key: string, name: string) {
    const alert = await this.alertCtrl.create({
      header: 'Đặt tên trang',
      inputs: [{ name: 'name', type: 'text', placeholder: 'Tên trang', value: name }],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Tạo',
          handler: async (data) => {
            const pageName = data?.name?.trim() || name;
            try {
              const tpl = AI_PAGE_TEMPLATES.find((t) => t.key === key);
              const page = await this.service.create(pageName, tpl?.prompt ?? '', buildConfig(key));
              this.toast('Đã tạo trang');
              await this.load();
              this.router.navigate(['/ai-page', page.id]);
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Tạo trang thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  open(p: AiPage) {
    this.router.navigate(['/ai-page', p.id]);
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

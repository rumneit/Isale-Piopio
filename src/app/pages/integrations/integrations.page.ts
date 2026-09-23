import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote,
  AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  hardwareChipOutline, cardOutline, chatbubbleEllipsesOutline, megaphoneOutline,
  logoFacebook, codeSlashOutline, sparklesOutline, checkmarkCircleOutline,
} from 'ionicons/icons';
import { SettingsService } from '../../core/services/settings.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { IntegrationsService, IntegrationProvider } from '../../core/services/integrations.service';
import { Router } from '@angular/router';

/** Ánh xạ khoá cấu hình cũ -> provider mới (bảng integration_settings). */
const PROVIDER_BY_KEY: Record<string, IntegrationProvider> = {
  fb_page_token: 'fbpage',
  zalo_oa_token: 'zbs',
  sms_api_key: 'sms',
  sepay_token: 'sepay',
  ai_api_key: 'ai',
};

interface Integration {
  key: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
  keyLabel: string;
  /** Trang cấu hình chi tiết (nếu có). */
  path?: string;
}

@Component({
  selector: 'app-integrations',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /></ion-buttons>
        <ion-title>Tích hợp</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      @if (loading()) {
        <div class="page-loading"><ion-spinner name="crescent" /></div>
      } @else {
        <div class="app-page-container">
          <div class="app-banner-warning">
            <ion-icon name="hardware-chip-outline" />
            <span>Các tích hợp cần tài khoản dịch vụ của bạn. Nhấn để nhập khóa API — hệ thống lưu an toàn trên Supabase.</span>
          </div>

          <div class="app-card">
            <ion-list lines="full">
              @for (item of integrations; track item.key) {
                <ion-item button (click)="open(item)" detail="true">
                  <div class="int-icon" slot="start"><ion-icon [name]="item.icon" [color]="item.color" /></div>
                  <ion-label>
                    <h3>{{ item.name }}</h3>
                    <p>{{ item.desc }}</p>
                  </ion-label>
                  @if (isConnected(item)) {
                    <ion-badge slot="end" color="success"><ion-icon name="checkmark-circle-outline" /> Đã kết nối</ion-badge>
                  } @else {
                    <ion-badge slot="end" color="medium">Chưa cấu hình</ion-badge>
                  }
                </ion-item>
              }
            </ion-list>
          </div>
          <ion-note class="page-hint">Khóa API chỉ hiển thị một lần khi nhập — lưu mã hóa phía Supabase</ion-note>
        </div>
      }
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .int-icon { width: 42px; height: 42px; border-radius: 12px; background: var(--app-surface-alt); display: flex; align-items: center; justify-content: center; }
    .int-icon ion-icon { font-size: 22px; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; align-items: center; }
    ion-item h3 { font-size: 15px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; white-space: normal; }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 4px; }
  `],
})
export class IntegrationsPage implements OnInit {
  readonly settingsService = inject(SettingsService);
  private integrationsService = inject(IntegrationsService);
  private router = inject(Router);
  private sb = inject(SupabaseService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly loading = signal(true);
  readonly enabledProviders = signal<Partial<Record<IntegrationProvider, boolean>>>({});

  readonly integrations: Integration[] = [
    { key: 'fb_page_token', name: 'Facebook Fanpage', desc: 'Kết nối fanpage để nhận tin nhắn + đơn online', icon: 'logo-facebook', color: 'primary', keyLabel: 'Page Access Token', path: '/fbpage' },
    { key: 'zalo_oa_token', name: 'Zalo ZBS Marketing', desc: 'Gửi tin Zalo ZNS/ZBS chăm sóc khách hàng', icon: 'chatbubble-ellipses-outline', color: 'primary', keyLabel: 'Zalo OA Access Token', path: '/zbs-marketing' },
    { key: 'sms_api_key', name: 'SMS Brandname', desc: 'Gửi SMS marketing / OTP đến khách hàng', icon: 'megaphone-outline', color: 'tertiary', keyLabel: 'SMS API Key', path: '/sms-marketing' },
    { key: 'sepay_token', name: 'SePay', desc: 'Tự động đối soát chuyển khoản ngân hàng', icon: 'card-outline', color: 'primary', keyLabel: 'SePay API Token', path: '/sepay-payment' },
    { key: 'ai_api_key', name: 'Trợ lý AI', desc: 'Phân tích doanh thu, gợi ý bán hàng bằng AI', icon: 'sparkles-outline', color: 'warning', keyLabel: 'AI API Key', path: '/ai-services' },
    { key: 'external_api_key', name: 'External API', desc: 'Cấp token cho hệ thống ngoài gọi dữ liệu PioPio', icon: 'code-slash-outline', color: 'medium', keyLabel: 'API Key', path: '/external-api' },
  ];

  constructor() {
    addIcons({
      hardwareChipOutline, cardOutline, chatbubbleEllipsesOutline, megaphoneOutline,
      logoFacebook, codeSlashOutline, sparklesOutline, checkmarkCircleOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    await this.settingsService.load();
    try {
      const list = await this.integrationsService.list();
      const map: Partial<Record<IntegrationProvider, boolean>> = {};
      for (const s of list) map[s.provider] = s.enabled;
      this.enabledProviders.set(map);
    } catch (e: any) {
      console.error('load integrations failed', e);
    }
    this.loading.set(false);
  }

  async editKey(item: Integration) {
    const current = this.settingsService.get(item.key) ?? '';
    const alert = await this.alertCtrl.create({
      header: item.name,
      message: item.desc,
      inputs: [{ name: 'value', type: 'text', placeholder: item.keyLabel, value: current }],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: current ? 'Xóa kết nối' : 'Hủy',
          role: 'destructive',
          handler: async () => {
            try {
              await this.settingsService.set(item.key, '');
              await this.settingsService.load();
              this.toast('Đã xóa kết nối');
            } catch (e: any) {
              this.toast(e?.message ?? 'Thất bại', 'danger');
            }
            return true;
          },
        },
        {
          text: 'Lưu',
          handler: async (data) => {
            if (!data?.value?.trim()) {
              this.toast('Vui lòng nhập khóa', 'danger');
              return false;
            }
            try {
              await this.settingsService.set(item.key, data.value.trim());
              await this.settingsService.load();
              this.toast('Đã lưu kết nối ' + item.name);
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

  open(item: Integration) {
    if (item.path) {
      this.router.navigateByUrl(item.path);
      return;
    }
    this.editKey(item);
  }

  /** Đã kết nối khi có khoá cũ (settings) hoặc cấu hình mới đang bật. */
  isConnected(item: Integration): boolean {
    if (this.settingsService.get(item.key)) return true;
    const provider = PROVIDER_BY_KEY[item.key];
    return !!provider && !!this.enabledProviders()[provider];
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

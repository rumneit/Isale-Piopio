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

interface Integration {
  key: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
  keyLabel: string;
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
                <ion-item button (click)="editKey(item)" detail="true">
                  <div class="int-icon" slot="start"><ion-icon [name]="item.icon" [color]="item.color" /></div>
                  <ion-label>
                    <h3>{{ item.name }}</h3>
                    <p>{{ item.desc }}</p>
                  </ion-label>
                  @if (settingsService.get(item.key)) {
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
  private sb = inject(SupabaseService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly loading = signal(true);

  readonly integrations: Integration[] = [
    { key: 'sepay_token', name: 'SePay', desc: 'Tự động đối soát chuyển khoản ngân hàng', icon: 'card-outline', color: 'primary', keyLabel: 'SePay API Token' },
    { key: 'zalo_oa_token', name: 'Zalo OA', desc: 'Gửi tin nhắn chăm sóc khách qua Zalo Official Account', icon: 'chatbubble-ellipses-outline', color: 'primary', keyLabel: 'Zalo OA Access Token' },
    { key: 'sms_api_key', name: 'SMS Brandname', desc: 'Gửi SMS marketing / OTP đến khách hàng', icon: 'megaphone-outline', color: 'tertiary', keyLabel: 'SMS API Key' },
    { key: 'fb_page_token', name: 'Facebook Page', desc: 'Kết nối fanpage để nhận tin nhắn + đơn online', icon: 'logo-facebook', color: 'primary', keyLabel: 'Page Access Token' },
    { key: 'external_api_key', name: 'External API', desc: 'Cho hệ thống ngoài gọi dữ liệu PioPio', icon: 'code-slash-outline', color: 'medium', keyLabel: 'API Key' },
    { key: 'ai_api_key', name: 'AI Assistant', desc: 'Trợ lý AI phân tích doanh thu, gợi ý bán hàng', icon: 'sparkles-outline', color: 'warning', keyLabel: 'AI API Key' },
  ];

  constructor() {
    addIcons({
      hardwareChipOutline, cardOutline, chatbubbleEllipsesOutline, megaphoneOutline,
      logoFacebook, codeSlashOutline, sparklesOutline, checkmarkCircleOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    await this.settingsService.load();
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

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

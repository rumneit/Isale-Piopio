import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonButton, IonNote,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { rocketOutline, checkmarkOutline, shieldCheckmarkOutline } from 'ionicons/icons';

@Component({
  selector: 'app-pricing',
  imports: [CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent, IonButton, IonNote],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /></ion-buttons>
        <ion-title>Bảng giá</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <div class="app-page-container">
        <div class="price-card price-free">
          <div class="price-head">
            <h3>Miễn phí</h3>
            <div class="price-value">0₫<span>/mãi mãi</span></div>
          </div>
          <ul>
            <li><ion-icon name="checkmark-outline" /> 1 cửa hàng · 1 người dùng</li>
            <li><ion-icon name="checkmark-outline" /> Bán hàng, tồn kho, thu chi</li>
            <li><ion-icon name="checkmark-outline" /> 500 sản phẩm</li>
            <li><ion-icon name="checkmark-outline" /> Báo cáo cơ bản</li>
          </ul>
        </div>

        <div class="price-card price-pro">
          <div class="pro-badge">Phổ biến nhất</div>
          <div class="price-head">
            <h3>Pro</h3>
            <div class="price-value">149.000₫<span>/tháng</span></div>
          </div>
          <ul>
            <li><ion-icon name="checkmark-outline" /> Không giới hạn sản phẩm</li>
            <li><ion-icon name="checkmark-outline" /> CRM + SMS/Zalo Marketing</li>
            <li><ion-icon name="checkmark-outline" /> Tích hợp SePay, Facebook</li>
            <li><ion-icon name="checkmark-outline" /> 10 nhân viên, phân quyền</li>
            <li><ion-icon name="checkmark-outline" /> Báo cáo nâng cao + xuất Excel</li>
            <li><ion-icon name="checkmark-outline" /> Hỗ trợ ưu tiên 24/7</li>
          </ul>
          <ion-button expand="block" class="price-cta" (click)="contact()">Nâng cấp Pro</ion-button>
        </div>

        <div class="price-card">
          <div class="price-head">
            <h3>Enterprise</h3>
            <div class="price-value">Liên hệ</div>
          </div>
          <ul>
            <li><ion-icon name="checkmark-outline" /> Đa chi nhánh, đa kho</li>
            <li><ion-icon name="checkmark-outline" /> Tích hợp API riêng</li>
            <li><ion-icon name="checkmark-outline" /> Quản trị viên chuyên biệt</li>
            <li><ion-icon name="checkmark-outline" /> SLA cam kết 99.9%</li>
          </ul>
          <ion-button expand="block" fill="outline" (click)="contact()">Liên hệ tư vấn</ion-button>
        </div>

        <ion-note class="pricing-note">
          <ion-icon name="shield-checkmark-outline" />
          Dữ liệu của bạn được bảo vệ bởi Row Level Security của Supabase
        </ion-note>
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .price-card { background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 16px; padding: 18px; margin-bottom: 14px; position: relative; }
    .price-pro { border: 2px solid var(--ion-color-primary); }
    .pro-badge { position: absolute; top: -10px; right: 14px; background: linear-gradient(135deg, var(--ion-color-primary), var(--ion-color-secondary)); color: #fff; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 10px; }
    .price-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
    .price-head h3 { margin: 0; font-size: 18px; font-weight: 800; color: var(--app-text); }
    .price-value { font-size: 20px; font-weight: 800; color: var(--ion-color-primary); }
    .price-value span { font-size: 12px; color: var(--app-text-muted); font-weight: 500; }
    ul { list-style: none; margin: 0 0 14px; padding: 0; }
    li { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--app-text); padding: 4px 0; }
    li ion-icon { color: var(--ion-color-success); flex-shrink: 0; }
    .price-cta { --background: linear-gradient(135deg, var(--ion-color-primary), var(--ion-color-secondary)); }
    .pricing-note { display: flex; align-items: center; gap: 6px; justify-content: center; font-size: 12px; color: var(--app-text-muted); padding: 4px; }
  `],
})
export class PricingPage {
  constructor() {
    addIcons({ rocketOutline, checkmarkOutline, shieldCheckmarkOutline });
  }

  contact() {
    window.open('mailto:contact@piopio.app?subject=Nang%20cap%20PioPio', '_blank');
  }
}

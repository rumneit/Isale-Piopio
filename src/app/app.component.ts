import { Component, inject } from '@angular/core';
import {
  IonApp,
  IonRouterOutlet,
  IonMenu,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonIcon,
  IonLabel,
  IonMenuToggle,
  IonFooter,
} from '@ionic/angular';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  storefrontOutline,
  cartOutline,
  pricetagsOutline,
  peopleOutline,
  swapHorizontalOutline,
  walletOutline,
  documentTextOutline,
  barChartOutline,
  cubeOutline,
  clipboardOutline,
  analyticsOutline,
  helpCircleOutline,
  settingsOutline,
  logOutOutline,
  personOutline,
  gridOutline,
  returnDownBackOutline,
  calendarOutline,
  bookOutline,
  timeOutline,
  arrowRedoOutline,
  restaurantOutline,
  cloudUploadOutline,
  downloadOutline,
} from 'ionicons/icons';
import { Router } from '@angular/router';
import { AuthService } from './core/services/auth.service';

interface MenuItem {
  title: string;
  icon: string;
  path: string;
}

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [
    IonApp,
    IonRouterOutlet,
    IonMenu,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonIcon,
    IonLabel,
    IonMenuToggle,
    IonFooter,
    RouterLink,
    RouterLinkActive,
  ],
})
export class AppComponent {
  readonly auth = inject(AuthService);
  private router = inject(Router);

  readonly menuItems: MenuItem[] = [
    { title: 'Trang chủ', icon: 'grid-outline', path: '/home' },
    { title: 'Đơn hàng', icon: 'cart-outline', path: '/order' },
    { title: 'Trả hàng', icon: 'return-down-back-outline', path: '/returns' },
    { title: 'Sản phẩm', icon: 'pricetags-outline', path: '/product' },
    { title: 'Nhập hàng', icon: 'download-outline', path: '/received-note' },
    { title: 'Chuyển hàng', icon: 'arrow-redo-outline', path: '/transfer' },
    { title: 'Khách hàng', icon: 'people-outline', path: '/contact' },
    { title: 'Giao dịch', icon: 'swap-horizontal-outline', path: '/trade' },
    { title: 'Sổ tiền', icon: 'wallet-outline', path: '/money-account' },
    { title: 'Công nợ', icon: 'document-text-outline', path: '/debt' },
    { title: 'Báo cáo', icon: 'bar-chart-outline', path: '/report' },
    { title: 'Kiểm kho', icon: 'clipboard-outline', path: '/stock-check' },
    { title: 'Lịch', icon: 'calendar-outline', path: '/calendar' },
    { title: 'Ghi chú', icon: 'book-outline', path: '/note' },
    { title: 'Ca làm việc', icon: 'time-outline', path: '/shift' },
    { title: 'Quản bàn', icon: 'restaurant-outline', path: '/cafe-tables' },
    { title: 'Nhập dữ liệu', icon: 'cloud-upload-outline', path: '/import' },
    { title: 'CRM', icon: 'analytics-outline', path: '/crm' },
    { title: 'Nhân viên', icon: 'person-outline', path: '/staff' },
    { title: 'Cửa hàng', icon: 'storefront-outline', path: '/config' },
    { title: 'Trợ giúp', icon: 'help-circle-outline', path: '/help' },
    { title: 'Cấu hình', icon: 'settings-outline', path: '/config' },
  ];

  constructor() {
    addIcons({
      storefrontOutline,
      cartOutline,
      pricetagsOutline,
      peopleOutline,
      swapHorizontalOutline,
      walletOutline,
      documentTextOutline,
      barChartOutline,
      cubeOutline,
      clipboardOutline,
      analyticsOutline,
      helpCircleOutline,
      settingsOutline,
      logOutOutline,
      personOutline,
      gridOutline,
      returnDownBackOutline,
      calendarOutline,
      bookOutline,
      timeOutline,
      arrowRedoOutline,
      restaurantOutline,
      cloudUploadOutline,
      downloadOutline,
    });
  }

  get email(): string {
    return (this.auth.session() as any)?.user?.email ?? '';
  }

  get shopName(): string {
    return this.auth.shop()?.name ?? 'PioPio';
  }

  async logout() {
    await this.auth.logout();
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}

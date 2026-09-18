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
    { title: 'Sản phẩm', icon: 'pricetags-outline', path: '/product' },
    { title: 'Khách hàng', icon: 'people-outline', path: '/contact' },
    { title: 'Giao dịch', icon: 'swap-horizontal-outline', path: '/trade' },
    { title: 'Sổ tiền', icon: 'wallet-outline', path: '/money-account' },
    { title: 'Công nợ', icon: 'document-text-outline', path: '/debt' },
    { title: 'Báo cáo', icon: 'bar-chart-outline', path: '/report' },
    { title: 'Kiểm kho', icon: 'clipboard-outline', path: '/stock-check' },
    { title: 'CRM', icon: 'analytics-outline', path: '/module/crm-leads' },
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
    });
  }

  get email(): string {
    return (this.auth.session() as any)?.user?.email ?? '';
  }

  get shopName(): string {
    return this.auth.shop()?.name ?? 'ISale';
  }

  async logout() {
    await this.auth.logout();
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}

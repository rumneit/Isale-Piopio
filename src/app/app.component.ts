import { Component, OnInit, inject, computed } from '@angular/core';
import {
  IonApp,
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
import {
  Router,
  NavigationEnd,
  NavigationError,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
  ActivatedRouteSnapshot,
  RouteReuseStrategy,
} from '@angular/router';
import { IonicRouteStrategy, ActionSheetController, AlertController } from '@ionic/angular';
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
  linkOutline,
  mailOutline,
  cardOutline,
  pulseOutline,
  lockClosedOutline,
  briefcaseOutline,
  trendingUpOutline,
  speedometerOutline,
  shieldCheckmarkOutline,
  gitBranchOutline,
  gitMergeOutline,
  optionsOutline,
  keyOutline,
  rocketOutline,
  carOutline,
  medalOutline,
  sparklesOutline,
  homeOutline,
} from 'ionicons/icons';
import { AuthService } from './core/services/auth.service';

interface MenuItem {
  title: string;
  icon: string;
  path: string;
  /** Quyền cần có để thấy mục này (bỏ trống = ai cũng thấy). */
  permission?: string;
}

/**
 * Không tái sử dụng component cũ khi điều hướng — chống lỗi
 * outlet kẹt trang cũ (URL đổi nhưng view không swap).
 */
export class NoReuseRouteStrategy extends IonicRouteStrategy implements RouteReuseStrategy {
  override shouldReuseRoute(_future: ActivatedRouteSnapshot, _curr: ActivatedRouteSnapshot): boolean {
    return false;
  }
}

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [
    IonApp,
    RouterOutlet,
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
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
  ],
})
export class AppComponent implements OnInit {
  readonly auth = inject(AuthService);
  private router = inject(Router);
  private actionSheetCtrl = inject(ActionSheetController);
  private alertCtrl = inject(AlertController);

  /**
   * Tự phục hồi khi tab đang mở dùng bản JS cũ (sau deploy mới):
   * chunk cũ bị xóa trên server → điều hướng lỗi → reload 1 lần để lấy bản mới.
   */
  ngOnInit(): void {
    this.router.events.subscribe((e: any) => {
      if (e instanceof NavigationEnd) {
        sessionStorage.removeItem('piopio-chunk-reload');
      } else if (e instanceof NavigationError) {
        this.reportNavError(e);
      }
    });

    window.addEventListener('unhandledrejection', (ev) => {
      const msg = String((ev as PromiseRejectionEvent)?.reason?.message ?? ev);
      if (/loading chunk|dynamically imported module/i.test(msg)) {
        this.recoverFromStaleChunk();
      }
    });
    window.addEventListener('error', (ev) => {
      const msg = String(ev?.message ?? '');
      if (/loading chunk|dynamically imported module/i.test(msg)) {
        this.recoverFromStaleChunk();
      }
    });
  }

  /** Hiện lỗi điều hướng thay vì nuốt im lặng — để dễ chẩn đoán */
  private async reportNavError(e: NavigationError) {
    console.error('Navigation error:', (e as any).error ?? e);
    const message = String((e as any).error?.message ?? (e as any).error ?? 'Không xác định');
    try {
      const alert = await this.alertCtrl.create({
        header: 'Lỗi điều hướng',
        message,
        buttons: [
          {
            text: 'Tải lại trang',
            handler: () => this.recoverFromStaleChunk(),
          },
        ],
      });
      await alert.present();
    } catch {
      this.recoverFromStaleChunk();
    }
  }

  private recoverFromStaleChunk(): void {
    if (!sessionStorage.getItem('piopio-chunk-reload')) {
      sessionStorage.setItem('piopio-chunk-reload', '1');
      location.reload();
    }
  }

  readonly menuItems: MenuItem[] = [
    { title: 'Trang chủ', icon: 'grid-outline', path: '/home' },
    { title: 'Đơn hàng', icon: 'cart-outline', path: '/order', permission: 'sell' },
    { title: 'Trả hàng', icon: 'return-down-back-outline', path: '/returns', permission: 'sell' },
    { title: 'Sản phẩm', icon: 'pricetags-outline', path: '/product', permission: 'inventory' },
    { title: 'Nhập hàng', icon: 'download-outline', path: '/received-note', permission: 'inventory' },
    { title: 'Chuyển hàng', icon: 'arrow-redo-outline', path: '/transfer', permission: 'inventory' },
    { title: 'Khách hàng', icon: 'people-outline', path: '/contact', permission: 'crm' },
    { title: 'Giao dịch', icon: 'swap-horizontal-outline', path: '/trade', permission: 'sell' },
    { title: 'Sổ tiền', icon: 'wallet-outline', path: '/money-account', permission: 'money' },
    { title: 'Công nợ', icon: 'document-text-outline', path: '/debt', permission: 'money' },
    { title: 'Báo cáo', icon: 'bar-chart-outline', path: '/report', permission: 'report' },
    { title: 'Kiểm kho', icon: 'clipboard-outline', path: '/stock-check', permission: 'inventory' },
    { title: 'Lịch', icon: 'calendar-outline', path: '/calendar', permission: 'crm' },
    { title: 'Ghi chú', icon: 'book-outline', path: '/note', permission: 'crm' },
    { title: 'Ca làm việc', icon: 'time-outline', path: '/shift' },
    { title: 'Quản bàn', icon: 'restaurant-outline', path: '/cafe-tables', permission: 'sell' },
    { title: 'Nhập dữ liệu', icon: 'cloud-upload-outline', path: '/import', permission: 'inventory' },
    { title: 'Lịch sử thay đổi', icon: 'pulse-outline', path: '/activity-log', permission: 'crm' },
    { title: 'Phân quyền', icon: 'lock-closed-outline', path: '/permission' },
    { title: 'Tích hợp', icon: 'link-outline', path: '/integrations' },
    { title: 'Hỗ trợ', icon: 'mail-outline', path: '/support' },
    { title: 'CRM', icon: 'analytics-outline', path: '/crm', permission: 'crm' },
    { title: 'Cơ hội bán hàng', icon: 'briefcase-outline', path: '/crm/deals', permission: 'crm' },
    { title: 'Dự báo doanh thu', icon: 'trending-up-outline', path: '/crm/forecast', permission: 'crm' },
    { title: 'Chỉ tiêu', icon: 'speedometer-outline', path: '/crm/quota', permission: 'crm' },
    { title: 'Phê duyệt CRM', icon: 'shield-checkmark-outline', path: '/crm/approvals', permission: 'crm' },
    { title: 'Tuyến bán hàng', icon: 'git-branch-outline', path: '/sales-route', permission: 'sell' },
    { title: 'Kênh bán hàng', icon: 'storefront-outline', path: '/sales-channels', permission: 'sell' },
    { title: 'Đối tác vận chuyển', icon: 'car-outline', path: '/shipping-partners', permission: 'sell' },
    { title: 'Lọc khách trùng', icon: 'git-merge-outline', path: '/contact/filter-duplicate', permission: 'crm' },
    { title: 'Tích điểm', icon: 'sparkles-outline', path: '/point-config', permission: 'crm' },
    { title: 'Cấu hình thăng hạng', icon: 'medal-outline', path: '/level-config', permission: 'crm' },
    { title: 'Trường tùy chỉnh', icon: 'options-outline', path: '/custom-field' },
    { title: 'Bảng tùy chỉnh', icon: 'grid-outline', path: '/custom-table' },
    { title: 'Trang AI', icon: 'sparkles-outline', path: '/ai-dynamic-page', permission: 'report' },
    { title: 'Kết nối thuế', icon: 'document-text-outline', path: '/cyberlotus-tax', permission: 'money' },
    { title: 'API đối tác', icon: 'key-outline', path: '/external-api' },
    { title: 'Nâng cấp gói', icon: 'rocket-outline', path: '/pricing' },
    { title: 'Nhân viên', icon: 'person-outline', path: '/staff' },
    { title: 'Cửa hàng', icon: 'storefront-outline', path: '/config' },
    { title: 'Trợ giúp', icon: 'help-circle-outline', path: '/help' },
    { title: 'Cấu hình', icon: 'settings-outline', path: '/config' },
  ];

  /** Menu đã lọc theo quyền của người dùng hiện tại. */
  readonly visibleMenuItems = computed(() =>
    this.menuItems.filter((item) => !item.permission || this.auth.can(item.permission))
  );

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
      linkOutline,
      mailOutline,
      cardOutline,
      pulseOutline,
      lockClosedOutline,
      briefcaseOutline,
      trendingUpOutline,
      speedometerOutline,
      shieldCheckmarkOutline,
      gitBranchOutline,
      gitMergeOutline,
      optionsOutline,
      keyOutline,
      rocketOutline,
      carOutline,
      medalOutline,
      sparklesOutline,
      homeOutline,
    });
  }

  get email(): string {
    return (this.auth.session() as any)?.user?.email ?? '';
  }

  get shopName(): string {
    return this.auth.shop()?.name ?? 'PioPio';
  }

  async openShopSwitcher() {
    const shops = this.auth.shopsOwned();
    const sheet = await this.actionSheetCtrl.create({
      header: 'Chọn cửa hàng',
      buttons: [
        ...shops.map((s) => ({
          text: s.name + (s.id === this.auth.shop()?.id ? ' ✓' : ''),
          handler: () => this.auth.switchShop(s.id),
        })),
        { text: 'Hủy', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  async logout() {
    await this.auth.logout();
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}

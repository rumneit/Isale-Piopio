import { Component, OnInit, inject, signal } from '@angular/core';
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
import {
  Router,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  NavigationCancel,
  NavigationSkipped,
  RouterLink,
  RouterLinkActive,
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
} from 'ionicons/icons';
import { AuthService } from './core/services/auth.service';

interface MenuItem {
  title: string;
  icon: string;
  path: string;
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
export class AppComponent implements OnInit {
  readonly auth = inject(AuthService);
  private router = inject(Router);
  private actionSheetCtrl = inject(ActionSheetController);
  private alertCtrl = inject(AlertController);

  /** Bảng debug điều hướng — hiển thị tạm thời để chẩn đoán lỗi chuyển trang */
  readonly navDebug = signal<Array<{ t: string; info: string; time: string }>>([]);

  private debugPush(t: string, info: string) {
    const time = new Date().toLocaleTimeString('vi-VN', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0');
    this.navDebug.update((list) => [{ t, info, time }, ...list].slice(0, 10));
  }

  /**
   * Tự phục hồi khi tab đang mở dùng bản JS cũ (sau deploy mới):
   * chunk cũ bị xóa trên server → điều hướng lỗi → reload 1 lần để lấy bản mới.
   */
  ngOnInit(): void {
    console.info('[PioPio] build 2026-09-19-16:35 — pipeline-fix-2 (NoReuse + zone.js)');

    // ===== DEBUG PANEL: theo dõi toàn bộ sự kiện điều hướng =====
    this.debugPush('BOOT', location.hash || '#/');

    this.router.events.subscribe((e: any) => {
      if (e instanceof NavigationStart) {
        this.debugPush('START', e.url);
      } else if (e instanceof NavigationEnd) {
        sessionStorage.removeItem('piopio-chunk-reload');
        this.debugPush('END ✓', e.urlAfterRedirects);
      } else if (e instanceof NavigationCancel) {
        this.debugPush('CANCEL ✗', `${e.url} — reason: ${e.reason}`);
      } else if (e instanceof NavigationSkipped) {
        this.debugPush('SKIPPED ⤼', `${e.url} — ${(e as any).reason ?? ''}`);
      } else if (e instanceof NavigationError) {
        this.debugPush('ERROR ✗', `${e.url} — ${String((e as any).error?.message ?? (e as any).error)}`);
        this.reportNavError(e);
      }
    });

    document.addEventListener('click', (ev) => {
      const target = (ev.target as HTMLElement)?.closest?.('ion-item, .app-action, ion-fab-button, ion-button, a, button');
      if (target) {
        const text = (target.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 26);
        if (text) this.debugPush('CLICK', text);
      }
    }, true);
    // ============================================================

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
    { title: 'Lịch sử thay đổi', icon: 'pulse-outline', path: '/activity-log' },
    { title: 'Phân quyền', icon: 'lock-closed-outline', path: '/permission' },
    { title: 'Tích hợp', icon: 'link-outline', path: '/integrations' },
    { title: 'Bảng giá', icon: 'card-outline', path: '/pricing' },
    { title: 'Hỗ trợ', icon: 'mail-outline', path: '/support' },
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
      linkOutline,
      mailOutline,
      cardOutline,
      pulseOutline,
      lockClosedOutline,
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

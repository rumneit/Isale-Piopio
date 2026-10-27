import { AfterViewInit, Component, OnDestroy, OnInit, inject, computed, signal } from '@angular/core';
import {
  IonApp,
  IonMenu,
  IonHeader,
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
  closeOutline,
  searchOutline,
  closeCircleOutline,
  gridOutline,
  returnDownBackOutline,
  calendarOutline,
  bookOutline,
  timeOutline,
  arrowRedoOutline,
  cloudUploadOutline,
  downloadOutline,
  linkOutline,
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
  carOutline,
  medalOutline,
  sparklesOutline,
  homeOutline,
} from 'ionicons/icons';
import { AuthService } from './core/services/auth.service';
import { A11yLabelService } from './core/services/a11y-label.service';

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
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly auth = inject(AuthService);
  private router = inject(Router);
  private actionSheetCtrl = inject(ActionSheetController);
  private alertCtrl = inject(AlertController);
  private a11yLabels = inject(A11yLabelService);
  private menuObserver?: MutationObserver;
  private menuFocusTimer?: ReturnType<typeof setTimeout>;

  /**
   * Tự phục hồi khi tab đang mở dùng bản JS cũ (sau deploy mới):
   * chunk cũ bị xóa trên server → điều hướng lỗi → reload 1 lần để lấy bản mới.
   */
  ngOnInit(): void {
    // WCAG 2.2: gán accessible name cho nút icon-only thiếu nhãn (toàn app)
    this.a11yLabels.start();

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

  ngAfterViewInit(): void {
    const menu = document.querySelector('ion-menu');
    if (!menu) return;

    // Ionic tự focus mục đầu tiên khi mở menu; đổi sang mục đang active để
    // người dùng thấy ngay mình đang ở đâu, đồng thời cuộn mục đó vào khung nhìn.
    this.menuObserver = new MutationObserver(() => {
      if (!menu.classList.contains('show-menu')) {
        clearTimeout(this.menuFocusTimer);
        this.clearMenuSearch();
        return;
      }
      clearTimeout(this.menuFocusTimer);
      this.menuFocusTimer = setTimeout(() => this.focusActiveMenuItem(menu), 360);
    });
    this.menuObserver.observe(menu, { attributes: true, attributeFilter: ['class'] });
  }

  ngOnDestroy(): void {
    this.menuObserver?.disconnect();
    clearTimeout(this.menuFocusTimer);
  }

  private focusActiveMenuItem(menu: Element): void {
    if (!menu.classList.contains('show-menu')) return;
    if (document.activeElement instanceof Element && document.activeElement.closest('.app-menu-search')) {
      return;
    }

    const active = menu.querySelector<HTMLElement>('.menu-item-active');
    if (!active) return;
    const target = active.shadowRoot?.querySelector<HTMLElement>('a, button') ?? active;

    // Đưa đầu nhóm chứa mục active lên đầu vùng cuộn để vẫn thấy tên nhóm,
    // sau đó bảo đảm mục active không bị khuất dưới footer.
    const section = active.closest('.menu-section');
    const content = menu.querySelector('ion-content');
    const scrollEl = content?.shadowRoot?.querySelector<HTMLElement>('.inner-scroll');
    if (section && scrollEl) {
      const contentRect = scrollEl.getBoundingClientRect();
      const sectionRect = section.getBoundingClientRect();
      scrollEl.scrollTop += sectionRect.top - contentRect.top - 4;

      const activeRect = active.getBoundingClientRect();
      const bottom = scrollEl.getBoundingClientRect().bottom;
      if (activeRect.bottom > bottom) {
        scrollEl.scrollTop += activeRect.bottom - bottom + 8;
      }
    } else {
      active.scrollIntoView({ block: 'center', inline: 'nearest' });
    }

    target.focus({ preventScroll: true });
  }

  /**
   * Không dùng href="#main-content": ứng dụng dùng hash-router nên liên kết đó sẽ
   * bị hiểu thành route /main-content. Chặn điều hướng và chuyển focus trực tiếp.
   */
  skipToMain(event: Event): void {
    event.preventDefault();
    document.getElementById('main-content')?.focus();
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
    { title: 'Đơn vận chuyển', icon: 'cube-outline', path: '/shipments', permission: 'sell' },
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
    { title: 'Nhập dữ liệu', icon: 'cloud-upload-outline', path: '/import', permission: 'inventory' },
    { title: 'Lịch sử thay đổi', icon: 'pulse-outline', path: '/activity-log', permission: 'crm' },
    { title: 'Phân quyền', icon: 'lock-closed-outline', path: '/permission', permission: 'owner' },
    { title: 'Tích hợp', icon: 'link-outline', path: '/integrations', permission: 'owner' },
    { title: 'CRM', icon: 'analytics-outline', path: '/crm', permission: 'crm' },
    { title: 'Cơ hội bán hàng', icon: 'briefcase-outline', path: '/crm/deals', permission: 'crm' },
    { title: 'Dự báo doanh thu', icon: 'trending-up-outline', path: '/crm/forecast', permission: 'crm' },
    { title: 'Chỉ tiêu', icon: 'speedometer-outline', path: '/crm/quota', permission: 'crm' },
    { title: 'Phê duyệt CRM', icon: 'shield-checkmark-outline', path: '/crm/approvals', permission: 'crm' },
    { title: 'Kênh bán hàng', icon: 'storefront-outline', path: '/sales-channels', permission: 'sell' },
    { title: 'Đối tác vận chuyển', icon: 'car-outline', path: '/shipping-partners', permission: 'owner' },
    { title: 'Lọc khách trùng', icon: 'git-merge-outline', path: '/contact/filter-duplicate', permission: 'crm' },
    { title: 'Trường tùy chỉnh', icon: 'options-outline', path: '/custom-field', permission: 'owner' },
    { title: 'Bảng tùy chỉnh', icon: 'grid-outline', path: '/custom-table', permission: 'owner' },
    { title: 'Kết nối thuế', icon: 'document-text-outline', path: '/cyberlotus-tax', permission: 'owner' },
    { title: 'API đối tác', icon: 'key-outline', path: '/external-api', permission: 'owner' },
    { title: 'Cửa hàng', icon: 'storefront-outline', path: '/config', permission: 'owner' },
    { title: 'Trợ giúp', icon: 'help-circle-outline', path: '/help' },
  ];

  /** Thứ tự nhóm menu; mục mới chưa xếp nhóm sẽ rơi vào "Khác". */
  private readonly menuSections: Array<{ title: string; paths: string[] }> = [
    { title: 'Tổng quan', paths: ['/home'] },
    {
      title: 'Bán hàng',
      paths: ['/order', '/shipments', '/returns', '/trade', '/sales-channels'],
    },
    {
      title: 'Kho hàng',
      paths: ['/product', '/received-note', '/transfer', '/stock-check', '/import'],
    },
    {
      title: 'Khách hàng & CRM',
      paths: ['/contact', '/crm', '/crm/deals', '/crm/forecast', '/crm/quota', '/crm/approvals', '/calendar', '/note', '/contact/filter-duplicate'],
    },
    { title: 'Tài chính', paths: ['/money-account', '/debt', '/report'] },
    {
      title: 'Hệ thống',
      paths: ['/activity-log', '/permission', '/integrations', '/shipping-partners', '/custom-field', '/custom-table', '/cyberlotus-tax', '/external-api', '/config', '/help'],
    },
  ];

  readonly menuQuery = signal('');

  /** Menu đã lọc theo quyền và ô tìm kiếm của người dùng hiện tại. */
  readonly visibleMenuItems = computed(() => {
    const query = this.normalizeMenuText(this.menuQuery().trim());
    return this.menuItems.filter(
      (item) =>
        (!item.permission || this.auth.can(item.permission)) &&
        (!query || this.normalizeMenuText(item.title).includes(query))
    );
  });

  /** Nhóm các mục đang hiển thị để menu không còn là một danh sách dài, phẳng. */
  readonly menuGroups = computed(() => {
    const visible = this.visibleMenuItems();
    const byPath = new Map(visible.map((item) => [item.path, item]));
    const assigned = new Set<string>();
    const groups = this.menuSections
      .map(({ title, paths }) => {
        const items = paths
          .map((path) => byPath.get(path))
          .filter((item): item is MenuItem => !!item);
        items.forEach((item) => assigned.add(item.path));
        return { title, items };
      })
      .filter((group) => group.items.length > 0);

    const rest = visible.filter((item) => !assigned.has(item.path));
    if (rest.length) groups.push({ title: 'Khác', items: rest });
    return groups;
  });

  onMenuSearch(event: Event): void {
    this.menuQuery.set((event.target as HTMLInputElement)?.value ?? '');
  }

  clearMenuSearch(): void {
    this.menuQuery.set('');
  }

  /** Tìm không dấu để gõ "san pham" vẫn ra "Sản phẩm". */
  private normalizeMenuText(value: string): string {
    return (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toLocaleLowerCase('vi');
  }

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
      closeOutline,
      searchOutline,
      closeCircleOutline,
      gridOutline,
      returnDownBackOutline,
      calendarOutline,
      bookOutline,
      timeOutline,
      arrowRedoOutline,
      cloudUploadOutline,
      downloadOutline,
      linkOutline,
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
      carOutline,
      medalOutline,
      sparklesOutline,
      homeOutline,
    });
  }

  get email(): string {
    return (this.auth.session() as any)?.user?.email ?? '';
  }

  /** 1–2 chữ cái đầu để avatar menu có cá tính hơn icon mặc định. */
  get initials(): string {
    const source = (this.auth.displayName() || this.email || '?').trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toLocaleUpperCase('vi');
    }
    return source.slice(0, 2).toLocaleUpperCase('vi');
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


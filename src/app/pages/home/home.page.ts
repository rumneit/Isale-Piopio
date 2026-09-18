import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonBadge,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonMenuButton,
  IonList,
  IonItem,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  menuOutline,
  notificationsOutline,
  cartOutline,
  swapHorizontalOutline,
  listOutline,
  barChartOutline,
  documentTextOutline,
  pricetagsOutline,
  cubeOutline,
  downloadOutline,
  arrowRedoOutline,
  boatOutline,
  layersOutline,
  walletOutline,
  addCircleOutline,
  trendingUpOutline,
  trendingDownOutline,
  peopleOutline,
  personOutline,
  analyticsOutline,
  storefrontOutline,
  helpCircleOutline,
  settingsOutline,
  logOutOutline,
  refreshOutline,
  gridOutline,
  receiptOutline,
  cardOutline,
  checkmarkDoneOutline,
  scanOutline,
  starHalfOutline,
  diamondOutline,
  timeOutline,
  gitNetworkOutline,
  copyOutline,
  gitBranchOutline,
  handLeftOutline,
  pulseOutline,
  chatbubbleEllipsesOutline,
  megaphoneOutline,
  lockClosedOutline,
  codeSlashOutline,
  cloudOfflineOutline,
} from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { SupabaseService } from '../../core/services/supabase.service';

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  color: string;
  path: string;
}

interface HomeTab {
  id: string;
  label: string;
  actions: QuickAction[];
}

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonBadge,
    IonRefresher,
    IonRefresherContent,
    IonSpinner,
    IonMenuButton,
    IonList,
    IonItem,
  ],
})
export class HomePage implements OnInit {
  readonly auth = inject(AuthService);
  private data = inject(DataService);
  private sb = inject(SupabaseService);
  private router = inject(Router);

  readonly tabs: HomeTab[] = [
    {
      id: 'selling',
      label: 'Bán hàng',
      actions: [
        { id: 'make-order', label: 'Đơn hàng mới', icon: 'cart-outline', color: '#6030ff', path: '/order/add' },
        { id: 'make-trade', label: 'Giao dịch lẻ', icon: 'swap-horizontal-outline', color: '#47bdb5', path: '/trade/add' },
        { id: 'orders', label: 'Đơn hàng', icon: 'list-outline', color: '#e6bf00', path: '/order' },
        { id: 'reports', label: 'Báo cáo doanh thu', icon: 'bar-chart-outline', color: '#2dd55b', path: '/report' },
        { id: 'debts', label: 'Công nợ', icon: 'document-text-outline', color: '#ff7043', path: '/debt' },
        { id: 'quotes', label: 'Báo giá', icon: 'receipt-outline', color: '#5c6bc0', path: '/quote' },
        { id: 'promotions', label: 'Khuyến mãi', icon: 'card-outline', color: '#ec407a', path: '/promotion' },
        { id: 'scan', label: 'Quét mã', icon: 'scan-outline', color: '#26c6da', path: '/scan' },
      ],
    },
    {
      id: 'inventory',
      label: 'Kho/Sản phẩm',
      actions: [
        { id: 'products', label: 'Sản phẩm', icon: 'pricetags-outline', color: '#6030ff', path: '/product' },
        { id: 'materials', label: 'Nguyên liệu', icon: 'cube-outline', color: '#47bdb5', path: '/material' },
        { id: 'received', label: 'Nhập hàng', icon: 'download-outline', color: '#e6bf00', path: '/received-note' },
        { id: 'transfer', label: 'Chuyển hàng', icon: 'arrow-redo-outline', color: '#2dd55b', path: '/module/transfer-note' },
        { id: 'delivery', label: 'Giao hàng', icon: 'boat-outline', color: '#ff7043', path: '/delivery' },
        { id: 'stock-check', label: 'Kiểm kho', icon: 'layers-outline', color: '#5c6bc0', path: '/stock-check' },
        { id: 'serial', label: 'Serial/IMEI', icon: 'grid-outline', color: '#ec407a', path: '/module/serial' },
        { id: 'import', label: 'Nhập Excel', icon: 'download-outline', color: '#26c6da', path: '/module/import' },
      ],
    },
    {
      id: 'money',
      label: 'Thu chi',
      actions: [
        { id: 'new-transaction', label: 'Giao dịch mới', icon: 'add-circle-outline', color: '#6030ff', path: '/trade/add' },
        { id: 'accounts', label: 'Sổ tiền', icon: 'wallet-outline', color: '#47bdb5', path: '/money-account' },
        { id: 'trades', label: 'Giao dịch', icon: 'swap-horizontal-outline', color: '#e6bf00', path: '/trade' },
        { id: 'income', label: 'Báo cáo thu', icon: 'trending-up-outline', color: '#2dd55b', path: '/report' },
        { id: 'expense', label: 'Báo cáo chi', icon: 'trending-down-outline', color: '#ff7043', path: '/report' },
        { id: 'categories', label: 'Danh mục', icon: 'list-outline', color: '#5c6bc0', path: '/module/trade-category' },
        { id: 'categories-report', label: 'BC theo nhóm', icon: 'bar-chart-outline', color: '#ec407a', path: '/report' },
        { id: 'timely', label: 'BC theo thời gian', icon: 'analytics-outline', color: '#26c6da', path: '/report' },
      ],
    },
    {
      id: 'contacts',
      label: 'Khách & NV',
      actions: [
        { id: 'customers', label: 'Khách hàng', icon: 'people-outline', color: '#6030ff', path: '/contact' },
        { id: 'staff', label: 'Nhân viên', icon: 'person-outline', color: '#47bdb5', path: '/staff' },
        { id: 'point', label: 'Tích điểm', icon: 'star-half-outline', color: '#e6bf00', path: '/point' },
        { id: 'levels', label: 'Hạng thành viên', icon: 'diamond-outline', color: '#2dd55b', path: '/module/level-config' },
        { id: 'shift', label: 'Ca làm việc', icon: 'time-outline', color: '#ff7043', path: '/module/shift' },
        { id: 'org-chart', label: 'Sơ đồ tổ chức', icon: 'git-network-outline', color: '#5c6bc0', path: '/module/org-chart' },
        { id: 'import-contact', label: 'Nhập khách hàng', icon: 'download-outline', color: '#ec407a', path: '/module/contact-import' },
        { id: 'filter-dup', label: 'Trùng lặp', icon: 'copy-outline', color: '#26c6da', path: '/module/filter-duplicate' },
      ],
    },
    {
      id: 'crm',
      label: 'CRM',
      actions: [
        { id: 'crm-leads', label: 'Leads', icon: 'people-outline', color: '#6030ff', path: '/crm' },
        { id: 'crm-pipeline', label: 'Pipeline', icon: 'git-branch-outline', color: '#47bdb5', path: '/crm' },
        { id: 'crm-deals', label: 'Deals', icon: 'hand-left-outline', color: '#e6bf00', path: '/crm' },
        { id: 'crm-forecast', label: 'Dự báo', icon: 'trending-up-outline', color: '#2dd55b', path: '/module/crm-forecast' },
        { id: 'crm-activities', label: 'Hoạt động', icon: 'pulse-outline', color: '#ff7043', path: '/module/crm-activities' },
        { id: 'crm-settings', label: 'Cài đặt CRM', icon: 'settings-outline', color: '#5c6bc0', path: '/module/crm-settings' },
        { id: 'sms', label: 'SMS Marketing', icon: 'chatbubble-ellipses-outline', color: '#ec407a', path: '/module/sms-marketing' },
        { id: 'zalo', label: 'Zalo Marketing', icon: 'megaphone-outline', color: '#26c6da', path: '/module/zbs-marketing' },
      ],
    },
    {
      id: 'config',
      label: 'Cấu hình',
      actions: [
        { id: 'store', label: 'Cửa hàng', icon: 'storefront-outline', color: '#6030ff', path: '/config' },
        { id: 'staff-permission', label: 'Phân quyền', icon: 'lock-closed-outline', color: '#47bdb5', path: '/module/permission' },
        { id: 'external-api', label: 'External API', icon: 'code-slash-outline', color: '#e6bf00', path: '/module/external-api' },
        { id: 'sales-channels', label: 'Kênh bán', icon: 'storefront-outline', color: '#2dd55b', path: '/module/sales-channels' },
        { id: 'shipping', label: 'Vận chuyển', icon: 'boat-outline', color: '#ff7043', path: '/module/shipping' },
        { id: 'help', label: 'Trợ giúp', icon: 'help-circle-outline', color: '#5c6bc0', path: '/help' },
        { id: 'settings', label: 'Cài đặt', icon: 'settings-outline', color: '#ec407a', path: '/config' },
        { id: 'logout', label: 'Đăng xuất', icon: 'log-out-outline', color: '#c5000f', path: '__logout__' },
      ],
    },
  ];

  readonly selectedTab = signal('selling');

  constructor() {
    addIcons({
      menuOutline,
      notificationsOutline,
      cartOutline,
      swapHorizontalOutline,
      listOutline,
      barChartOutline,
      documentTextOutline,
      pricetagsOutline,
      cubeOutline,
      downloadOutline,
      arrowRedoOutline,
      boatOutline,
      layersOutline,
      walletOutline,
      addCircleOutline,
      trendingUpOutline,
      trendingDownOutline,
      peopleOutline,
      personOutline,
      analyticsOutline,
      storefrontOutline,
      helpCircleOutline,
      settingsOutline,
      logOutOutline,
      refreshOutline,
      gridOutline,
      receiptOutline,
      cardOutline,
      checkmarkDoneOutline,
      scanOutline,
      starHalfOutline,
      diamondOutline,
      timeOutline,
      gitNetworkOutline,
      copyOutline,
      gitBranchOutline,
      handLeftOutline,
      pulseOutline,
      chatbubbleEllipsesOutline,
      megaphoneOutline,
      lockClosedOutline,
      codeSlashOutline,
      cloudOfflineOutline,
    });
  }

  get stats() {
    return this.data.stats();
  }

  get recentOrders() {
    return this.data.recentOrders();
  }

  get loading() {
    return this.data.loading();
  }

  get supabaseReady() {
    return this.sb.isConfigured;
  }

  get shopName(): string {
    return this.auth.shop()?.name ?? 'Cửa hàng của tôi';
  }

  get greeting(): string {
    const h = new Date().getHours();
    if (h < 11) return 'Chào buổi sáng';
    if (h < 14) return 'Chào buổi trưa';
    if (h < 18) return 'Chào buổi chiều';
    return 'Chào buổi tối';
  }

  ngOnInit(): void {
    this.data.refreshHome();
  }

  doRefresh(event: CustomEvent) {
    this.data.refreshHome().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  selectTab(ev: CustomEvent) {
    this.selectedTab.set(ev.detail.value as string);
  }

  openAction(action: QuickAction) {
    if (action.path === '__logout__') {
      this.auth.logout().then(() => this.router.navigateByUrl('/login', { replaceUrl: true }));
      return;
    }
    this.router.navigateByUrl(action.path);
  }

  openPath(path: string) {
    this.router.navigateByUrl(path);
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}

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
  IonSpinner,
  IonMenuButton,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  menuOutline,
  notificationsOutline,
  settingsOutline,
  textOutline,
  bulbOutline,
  closeOutline,
  basketOutline,
  barcodeOutline,
  cloudOutline,
  cashOutline,
  readerOutline,
  trendingUpOutline,
  logoFacebook,
  sparklesOutline,
  colorWandOutline,
  cartOutline,
  clipboardOutline,
  folderOutline,
  businessOutline,
  documentAttachOutline,
  personAddOutline,
  checkboxOutline,
  syncOutline,
  albumsOutline,
  cogOutline,
  flashOutline,
  peopleOutline,
  helpCircleOutline,
  volumeHighOutline,
  gridOutline,
  cardOutline,
  starOutline,
  timeOutline,
  flagOutline,
  documentTextOutline,
  cloudUploadOutline,
  listOutline,
  boatOutline,
  createOutline,
  trashOutline,
} from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';
import { MoneyAccountsService } from '../../core/services/money-accounts.service';

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  color: string;
  path: string;
  isNew?: boolean;
}

interface HomeTab {
  id: string;
  label: string;
  tip: string;
  actions: QuickAction[];
}

interface ConfigItem {
  label: string;
  icon: string;
  path: string;
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
    IonSpinner,
    IonMenuButton,
  ],
})
export class HomePage implements OnInit {
  readonly auth = inject(AuthService);
  private moneyAccountsService = inject(MoneyAccountsService);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);

  readonly selectedTab = signal('selling');
  readonly tipDismissed = signal<Record<string, boolean>>({});
  readonly walletLoading = signal(true);
  readonly hasDefaultWallet = signal(true);
  readonly creatingWallet = signal(false);

  /** 4 tab thao tác nhanh — cấu trúc khớp ISale */
  readonly tabs: HomeTab[] = [
    {
      id: 'selling',
      label: 'Bán hàng',
      tip: 'Mẹo: Tạo đơn nhanh bằng cách quét mã vạch sản phẩm ngay trên thanh thao tác.',
      actions: [
        { id: 'sell', label: 'Bán hàng', icon: 'basket-outline', color: '#6030ff', path: '/order/add' },
        { id: 'scan-order', label: 'Tạo đơn: quét mã', icon: 'barcode-outline', color: '#47bdb5', path: '/scan' },
        { id: 'orders', label: 'QL đơn hàng', icon: 'list-outline', color: '#e6bf00', path: '/order' },
        { id: 'online-orders', label: 'Đơn từ Website', icon: 'cloud-outline', color: '#2dd55b', path: '/module/online-order' },
        { id: 'debt', label: 'Quản lý công nợ', icon: 'document-text-outline', color: '#ff7043', path: '/debt' },
        { id: 'trade', label: 'Quản lý Thu/Chi', icon: 'cash-outline', color: '#5c6bc0', path: '/trade' },
        { id: 'quote', label: 'Quản lý Báo giá', icon: 'reader-outline', color: '#ec407a', path: '/quote' },
        { id: 'delivery', label: 'Đơn vận chuyển', icon: 'boat-outline', color: '#26c6da', path: '/delivery' },
        { id: 'report', label: 'Báo cáo, biểu đồ', icon: 'trending-up-outline', color: '#2dd55b', path: '/report' },
        { id: 'fanpage', label: 'Quản lý Fanpage', icon: 'logo-facebook', color: '#1877f2', path: '/module/fbpage' },
        { id: 'ai-services', label: 'Dịch vụ AI', icon: 'sparkles-outline', color: '#a855f7', path: '/module/ai-services', isNew: true },
        { id: 'ai-page', label: 'Tạo trang với AI', icon: 'color-wand-outline', color: '#ff6b9d', path: '/module/ai-dynamic-page', isNew: true },
      ],
    },
    {
      id: 'inventory',
      label: 'Kho/Sản phẩm',
      tip: "Mẹo: Để đổi trả hàng, hãy dùng tính năng 'Trả hàng' trong chi tiết đơn hàng.",
      actions: [
        { id: 'products', label: 'Sản phẩm', icon: 'cart-outline', color: '#6030ff', path: '/product' },
        { id: 'received', label: 'Phiếu nhập kho', icon: 'clipboard-outline', color: '#47bdb5', path: '/received-note' },
        { id: 'transfer', label: 'Phiếu chuyển kho', icon: 'arrow-redo-outline', color: '#e6bf00', path: '/transfer' },
        { id: 'stock-check', label: 'Kiểm kê kho', icon: 'checkbox-outline', color: '#2dd55b', path: '/stock-check' },
        { id: 'category', label: 'Danh mục SP', icon: 'folder-outline', color: '#ff7043', path: '/module/category' },
        { id: 'multi-shop', label: 'Q/l nhiều shop/kho', icon: 'business-outline', color: '#5c6bc0', path: '/module/store' },
        { id: 'import-products', label: 'Nhập SP từ Excel', icon: 'document-attach-outline', color: '#ec407a', path: '/import' },
        { id: 'export-products', label: 'Xuất SP ra Excel', icon: 'reader-outline', color: '#26c6da', path: '/product' },
        { id: 'import-received', label: 'Nhập Phiếu Nhập từ file Excel', icon: 'reader-outline', color: '#8d6e63', path: '/module/received-note-import' },
      ],
    },
    {
      id: 'contacts',
      label: 'Khách và Nhân viên',
      tip: 'Mẹo: Chia sẻ mã giới thiệu cho bạn bè để cả hai cùng nhận ưu đãi PRO.',
      actions: [
        { id: 'customers', label: 'Khách hàng', icon: 'people-outline', color: '#6030ff', path: '/contact' },
        { id: 'sales-route', label: 'Tuyến bán hàng', icon: 'flag-outline', color: '#47bdb5', path: '/module/sales-route' },
        { id: 'staff', label: 'Quản lý nhân viên', icon: 'person-outline', color: '#e6bf00', path: '/staff' },
        { id: 'points', label: 'Tích điểm', icon: 'star-outline', color: '#2dd55b', path: '/point' },
        { id: 'notes', label: 'Ghi chú - Ảnh', icon: 'document-text-outline', color: '#ff7043', path: '/note' },
        { id: 'import-customers', label: 'Nhập khách Excel', icon: 'document-attach-outline', color: '#5c6bc0', path: '/import' },
        { id: 'export-customers', label: 'Xuất khách Excel', icon: 'reader-outline', color: '#ec407a', path: '/contact' },
        { id: 'import-contacts', label: 'Nhập danh bạ', icon: 'cloud-upload-outline', color: '#26c6da', path: '/module/contact-import' },
        { id: 'filter-dup', label: 'Lọc khách trùng', icon: 'copy-outline', color: '#8d6e63', path: '/module/filter-duplicate' },
        { id: 'shifts', label: 'Quản lý ca', icon: 'time-outline', color: '#607d8b', path: '/shift' },
      ],
    },
    {
      id: 'crm',
      label: 'CRM',
      tip: 'Mẹo: Kéo-thả khách giữa các cột trong Pipeline để cập nhật tiến độ chăm sóc.',
      actions: [
        { id: 'crm-help', label: 'CRM Help', icon: 'help-circle-outline', color: '#6030ff', path: '/help' },
        { id: 'crm-leads', label: 'Khách tiềm năng', icon: 'person-add-outline', color: '#47bdb5', path: '/crm' },
        { id: 'crm-activities', label: 'Hoạt động', icon: 'checkbox-outline', color: '#e6bf00', path: '/crm-activities' },
        { id: 'crm-sync', label: 'Đồng bộ điện thoại', icon: 'sync-outline', color: '#2dd55b', path: '/module/crm-device-sync' },
        { id: 'crm-pipeline', label: 'Pipeline tiềm năng', icon: 'albums-outline', color: '#ff7043', path: '/crm/pipeline' },
      ],
    },
  ];

  /** Nhóm cấu hình CRM hiển thị riêng dưới tab CRM */
  readonly crmConfigItems: ConfigItem[] = [
    { label: 'Cài đặt CRM', icon: 'cog-outline', path: '/module/crm-settings' },
    { label: 'Quy trình tự động', icon: 'flash-outline', path: '/module/crm-flow-settings' },
    { label: 'Sơ đồ tổ chức', icon: 'people-outline', path: '/org-chart' },
  ];

  /** Section Cấu hình — danh sách chip ngang */
  readonly configItems: ConfigItem[] = [
    { label: 'Vận chuyển', icon: 'boat-outline', path: '/module/shipping' },
    { label: 'Loa thông báo SePay', icon: 'volume-high-outline', path: '/integrations' },
    { label: 'Bảng dữ liệu tùy chỉnh', icon: 'grid-outline', path: '/module/custom-table' },
    { label: 'Ví/Tài khoản', icon: 'card-outline', path: '/money-account' },
    { label: 'Cấu hình shop', icon: 'settings-outline', path: '/config' },
    { label: 'Trợ giúp', icon: 'help-circle-outline', path: '/help' },
  ];

  constructor() {
    addIcons({
      menuOutline,
      notificationsOutline,
      settingsOutline,
      textOutline,
      bulbOutline,
      closeOutline,
      basketOutline,
      barcodeOutline,
      cloudOutline,
      cashOutline,
      readerOutline,
      trendingUpOutline,
      logoFacebook,
      sparklesOutline,
      colorWandOutline,
      cartOutline,
      clipboardOutline,
      folderOutline,
      businessOutline,
      documentAttachOutline,
      personAddOutline,
      checkboxOutline,
      syncOutline,
      albumsOutline,
      cogOutline,
      flashOutline,
      peopleOutline,
      helpCircleOutline,
      volumeHighOutline,
      gridOutline,
      cardOutline,
      starOutline,
      timeOutline,
      flagOutline,
      documentTextOutline,
      cloudUploadOutline,
      listOutline,
      boatOutline,
      createOutline,
      trashOutline,
    });
  }

  ngOnInit(): void {
    this.checkDefaultWallet();
  }

  get currentTab(): HomeTab {
    return this.tabs.find((t) => t.id === this.selectedTab()) ?? this.tabs[0];
  }

  get shopName(): string {
    return this.auth.shop()?.name ?? 'PioPio';
  }

  selectTab(ev: CustomEvent) {
    this.selectedTab.set(ev.detail.value as string);
  }

  isTipDismissed(tabId: string): boolean {
    return !!this.tipDismissed()[tabId];
  }

  dismissTip(tabId: string) {
    this.tipDismissed.update((m) => ({ ...m, [tabId]: true }));
  }

  openPath(path: string) {
    this.router.navigateByUrl(path);
  }

  openAction(action: QuickAction) {
    if (action.path === '__logout__') {
      this.auth.logout().then(() => this.router.navigateByUrl('/login', { replaceUrl: true }));
      return;
    }
    this.router.navigateByUrl(action.path);
  }

  private async checkDefaultWallet() {
    this.walletLoading.set(true);
    try {
      const accounts = await this.moneyAccountsService.list();
      this.hasDefaultWallet.set(accounts.length > 0);
    } catch (e) {
      console.error('check wallet failed', e);
      this.hasDefaultWallet.set(true);
    } finally {
      this.walletLoading.set(false);
    }
  }

  async createDefaultWallet() {
    this.creatingWallet.set(true);
    try {
      await this.moneyAccountsService.create('Tiền mặt', 'cash', 0);
      this.hasDefaultWallet.set(true);
      this.toast('Đã tạo ví/tài khoản mặc định');
    } catch (e: any) {
      this.toast(e?.message ?? 'Tạo ví thất bại', 'danger');
    } finally {
      this.creatingWallet.set(false);
    }
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  IonInput,
  ToastController,
  LoadingController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  menuOutline,
  notifications,
  settingsOutline,
  textOutline,
  bulbOutline,
  closeOutline,
  basket,
  barcode,
  cloudOutline,
  cloud,
  cash,
  readerOutline,
  reader,
  trendingUp,
  cart,
  clipboard,
  folderOpen,
  business,
  documentAttach,
  personAdd,
  person,
  checkbox,
  syncOutline,
  albumsOutline,
  cogOutline,
  flashOutline,
  people,
  helpCircleOutline,
  volumeHighOutline,
  gridOutline,
  cardOutline,
  star,
  time,
  flag,
  documentText,
  cloudUpload,
  listOutline,
  copy,
  boat,
  createOutline,
  trashOutline,
  rocketOutline,
  callOutline,
  mailOutline,
  home,
  walletOutline,
  chatbubbleEllipsesOutline,
  storefront,
  arrowRedo,
  personAddOutline,
  checkboxOutline,
  peopleOutline,
  boatOutline,
} from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';
import { MoneyAccountsService } from '../../core/services/money-accounts.service';
import { ProductExcelService } from '../../core/services/product-excel.service';

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
    IonInput,
    FormsModule,
  ],
})
export class HomePage implements OnInit {
  readonly auth = inject(AuthService);
  private moneyAccountsService = inject(MoneyAccountsService);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private loadingCtrl = inject(LoadingController);
  private productExcel = inject(ProductExcelService);

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
        { id: 'sell', label: 'Bán hàng', icon: 'basket', color: '#6030ff', path: '/sale' },
        { id: 'scan-order', label: 'Tạo đơn: quét mã', icon: 'barcode', color: '#47bdb5', path: '__scan__' },
        { id: 'orders', label: 'QL đơn hàng', icon: 'storefront', color: '#3880ff', path: '/order' },
        { id: 'online-orders', label: 'Đơn từ Website', icon: 'cloud', color: '#6C3483', path: '/online-order' },
        { id: 'debt', label: 'Quản lý công nợ', icon: 'document-text', color: '#ff7043', path: '/debt' },
        { id: 'trade', label: 'Quản lý Thu/Chi', icon: 'cash', color: '#5c6bc0', path: '/trade' },
        { id: 'quote', label: 'Quản lý Báo giá', icon: 'reader', color: '#ec407a', path: '/quote' },
        { id: 'delivery', label: 'Đơn vận chuyển', icon: 'boat', color: '#26c6da', path: '/delivery' },
        { id: 'report', label: 'Báo cáo, biểu đồ', icon: 'trending-up', color: '#2C3E50', path: '/report' },
      ],
    },
    {
      id: 'inventory',
      label: 'Kho/Sản phẩm',
      tip: "Mẹo: Để đổi trả hàng, hãy dùng tính năng 'Trả hàng' trong chi tiết đơn hàng.",
      actions: [
        { id: 'products', label: 'Sản phẩm', icon: 'cart', color: '#e6bf00', path: '/product' },
        { id: 'received', label: 'Phiếu nhập kho', icon: 'clipboard', color: '#e6bf00', path: '/received-note' },
        { id: 'suppliers', label: 'Nhà cung cấp', icon: 'business', color: '#00897b', path: '/suppliers' },
        { id: 'supplier-debts', label: 'Công nợ NCC', icon: 'wallet-outline', color: '#e53935', path: '/supplier-debts' },
        { id: 'transfer', label: 'Phiếu chuyển kho', icon: 'arrow-redo', color: '#f88962', path: '/transfer' },
        { id: 'stock-check', label: 'Kiểm kê kho', icon: 'checkbox', color: '#184fc7', path: '/stock-check' },
        { id: 'category', label: 'Danh mục SP', icon: 'folder-open', color: '#ff7043', path: '/module/category' },
        { id: 'multi-shop', label: 'Q/l nhiều shop/kho', icon: 'business', color: '#5c6bc0', path: '/module/store' },
        { id: 'import-products', label: 'Nhập SP từ Excel', icon: 'document-attach', color: '#ec407a', path: '/product/import' },
        { id: 'export-products', label: 'Xuất SP ra Excel', icon: 'reader', color: '#26c6da', path: '__export_products__' },
        { id: 'import-received', label: 'Nhập Phiếu Nhập từ file Excel', icon: 'reader', color: '#8d6e63', path: '/received-note/import' },
        { id: 'inventory-report', label: 'Báo cáo, biểu đồ', icon: 'trending-up', color: '#2C3E50', path: '/report' },
      ],
    },
    {
      id: 'contacts',
      label: 'Khách hàng',
      tip: 'Mẹo: Chia sẻ mã giới thiệu cho bạn bè để cả hai cùng nhận ưu đãi PRO.',
      actions: [
        { id: 'customers', label: 'Khách hàng', icon: 'people', color: '#3dc2ff', path: '/contact' },
        { id: 'notes', label: 'Ghi chú - Ảnh', icon: 'document-text', color: '#ff7043', path: '/note' },
        { id: 'import-customers', label: 'Nhập khách Excel', icon: 'document-attach', color: '#5c6bc0', path: '/contact/import' },
        { id: 'export-customers', label: 'Xuất khách Excel', icon: 'reader', color: '#ec407a', path: '/contact/export' },
        { id: 'import-contacts', label: 'Nhập danh bạ', icon: 'cloud-upload', color: '#26c6da', path: '/contact/import-device' },
        { id: 'filter-dup', label: 'Lọc khách trùng', icon: 'copy', color: '#8d6e63', path: '/contact/filter-duplicate' },
      ],
    },
    {
      id: 'crm',
      label: 'CRM',
      tip: 'Mẹo: Ghi lại hoạt động chăm sóc để theo dõi khách tiềm năng nhất quán.',
      actions: [
        { id: 'crm-help', label: 'CRM Help', icon: 'help-circle-outline', color: '#6030ff', path: '/help' },
        { id: 'crm-leads', label: 'Khách tiềm năng', icon: 'person-add-outline', color: '#47bdb5', path: '/crm' },
        { id: 'crm-activities', label: 'Hoạt động', icon: 'checkbox-outline', color: '#e6bf00', path: '/crm-activities' },
        { id: 'crm-sync', label: 'Đồng bộ điện thoại', icon: 'sync-outline', color: '#2dd55b', path: '/module/crm-device-sync' },
      ],
    },
  ];

  /** Nhóm cấu hình CRM hiển thị riêng dưới tab CRM */
  readonly crmConfigItems: ConfigItem[] = [
    { label: 'Cài đặt CRM', icon: 'cog-outline', path: '/module/crm-settings' },
    { label: 'Quy trình tự động', icon: 'flash-outline', path: '/module/crm-flow-settings' },
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
      notifications,
      settingsOutline,
      textOutline,
      bulbOutline,
      closeOutline,
      basket,
      barcode,
      cloudOutline,
      cloud,
      cash,
      readerOutline,
      reader,
      trendingUp,
      cart,
      clipboard,
      folderOpen,
      business,
      documentAttach,
      personAdd,
      person,
      checkbox,
      syncOutline,
      albumsOutline,
      cogOutline,
      flashOutline,
      people,
      helpCircleOutline,
      volumeHighOutline,
      gridOutline,
      cardOutline,
      star,
      time,
      flag,
      documentText,
      cloudUpload,
      listOutline,
      copy,
      boat,
      createOutline,
      trashOutline,
      rocketOutline,
      callOutline,
      mailOutline,
      home,
      walletOutline,
      chatbubbleEllipsesOutline,
      storefront,
      arrowRedo,
      personAddOutline,
      checkboxOutline,
      peopleOutline,
      boatOutline,
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
    if (action.path === '__scan__') {
      this.openBarcodeModal();
      return;
    }
    if (action.path === '__export_products__') {
      void this.exportProducts();
      return;
    }
    this.router.navigateByUrl(action.path);
  }

  private async exportProducts(): Promise<void> {
    const loading = await this.loadingCtrl.create({ message: 'Đang tạo file Excel…' });
    await loading.present();
    try {
      const count = await this.productExcel.export();
      await this.toast(`Đã xuất ${count} sản phẩm ra Excel.`);
    } catch (error: any) {
      await this.toast(error?.message ?? 'Xuất sản phẩm thất bại.', 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  // ===== Modal quét mã vạch (giống bản gốc) =====
  readonly barcodeModalOpen = signal(false);
  barcodeValue = '';

  openBarcodeModal() {
    this.barcodeValue = '';
    this.barcodeModalOpen.set(true);
  }

  closeBarcodeModal() {
    this.barcodeModalOpen.set(false);
  }

  confirmBarcode() {
    const code = this.barcodeValue.trim();
    this.barcodeModalOpen.set(false);
    this.router.navigate(['/sale'], { queryParams: code ? { barcode: code } : {} });
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

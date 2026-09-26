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
  IonInput,
  IonTextarea,
  IonSpinner,
  IonNote,
  IonList,
  IonItem,
  IonLabel,
  IonToggle,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  ToastController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  homeOutline,
  checkmarkOutline,
  storefrontOutline,
  globeOutline,
  settingsOutline,
  documentTextOutline,
  informationCircleOutline,
  cardOutline,
  cloudUploadOutline,
  personOutline,
  lockClosedOutline,
  cloudDownloadOutline,
  codeSlashOutline,
  eyeOutline,
  downloadOutline,
  refreshOutline,
  chevronForwardOutline,
} from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { CsvExportService } from '../../core/services/csv-export.service';
import { SettingsService } from '../../core/services/settings.service';

interface ToggleSetting {
  key: string;
  label: string;
}

@Component({
  selector: 'app-config',
  templateUrl: './config.page.html',
  styleUrls: ['./config.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonInput,
    IonTextarea,
    IonSpinner,
    IonNote,
    IonList,
    IonItem,
    IonLabel,
    IonToggle,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    FormsModule,
  ],
})
export class ConfigPage implements OnInit {
  private auth = inject(AuthService);
  private sb = inject(SupabaseService);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private csvExport = inject(CsvExportService);
  private settingsService = inject(SettingsService);

  readonly busy = signal(false);
  readonly backingUp = signal(false);
  readonly changingPw = signal(false);
  readonly templateTab = signal<'edit' | 'preview'>('edit');
  readonly tab = signal<'shop' | 'website' | 'other' | 'template'>('shop');

  // Thông tin shop
  shopName = '';
  shopDescription = '';
  shopPhone = '';
  shopAddress = '';
  shopWebsite = '';
  shopLogoUrl = '';

  // Ngân hàng
  bankName = '';
  bankOwner = '';
  bankAccount = '';

  // Tài khoản
  fullName = '';
  newPassword = '';
  confirmPassword = '';

  // Cấu hình khác — lựa chọn
  language = 'vi';
  geminiApiKey = '';
  currency = 'VND';
  dateFormat = 'dd/MM/yyyy';
  timeFormat = 'HH:mm';

  readonly languageOptions = [
    { value: 'vi', label: 'Tiếng Việt' },
    { value: 'en', label: 'English' },
  ];
  readonly currencyOptions = [
    { value: 'VND', label: 'VNĐ (₫)' },
    { value: 'USD', label: 'USD ($)' },
  ];
  readonly dateFormatOptions = ['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd'];
  readonly timeFormatOptions = ['HH:mm', 'hh:mm A'];

  // Cấu hình khác — danh sách switch (khớp bản gốc)
  readonly toggleSettings: ToggleSetting[] = [
    { key: 'no_sell_zero_qty', label: 'Số lượng 0, không thể bán' },
    { key: 'hide_materials', label: 'Ẩn tính năng Nguyên Vật Liệu' },
    { key: 'hide_table', label: 'Ẩn tính năng Đặt bàn' },
    { key: 'hide_booking', label: 'Ẩn tính năng Đặt lịch' },
    { key: 'enable_export_note', label: 'Bật chức năng Phiếu Xuất' },
    { key: 'hide_promotion', label: 'Ẩn tính năng Khuyến mại' },
    { key: 'hide_tax', label: 'Ẩn thuế khỏi đơn' },
    { key: 'print_large_invoice', label: 'In hóa đơn dạng Hóa đơn bán hàng (khổ lớn)' },
    { key: 'hide_discount_column', label: 'Ẩn cột chiết khấu khi in đơn' },
    { key: 'show_staff_phone', label: 'Hiện SĐT nhân viên khi in đơn' },
    { key: 'show_staff_sign', label: 'Hiện tên nhân viên dưới phần chữ ký' },
    { key: 'hide_product_code', label: 'Ẩn mã sản phẩm khi in đơn' },
    { key: 'profit_latest_cost', label: 'Tính lợi nhuận theo Chi phí mới nhất (không tích sổ tính theo thời điểm lên đơn)' },
    { key: 'sync_cost_from_received', label: 'Đồng bộ Giá Nhập từ Phiếu Nhập' },
    { key: 'stock_by_variant', label: 'Bật Tồn kho cho Phân loại sản phẩm' },
    { key: 'print_qr', label: 'In QR code khi in đơn' },
    { key: 'enable_shift_close', label: 'Bật tính năng kết ca' },
    { key: 'auto_order_code', label: 'Mã đơn hàng tự động' },
    { key: 'auto_product_code', label: 'Mã SP tự động' },
    { key: 'sms_marketing', label: 'Bật tính năng SMS Marketing' },
    { key: 'zalo_marketing', label: 'Bật tính năng Zalo Marketing' },
  ];
  toggleValues: Record<string, boolean> = {};
  printNote = '';
  emptyRows: number | null = 2;

  // Template hóa đơn
  invoiceTemplate = '';
  readonly defaultInvoiceTemplate = `{{!-- Mẫu hóa đơn mặc định của PioPio --}}
{{#if shop.name}}
<div style="border-bottom: 1px solid #000; padding-bottom: 8px;">
  <div style="text-align: center;">
    <strong style="font-size: 1.1em;">{{shop.name}}</strong><br>
    {{#if shop.phone}}ĐT: {{shop.phone}}<br>{{/if}}
    {{#if shop.address}}{{shop.address}}{{/if}}
  </div>
</div>
{{/if}}
<div style="text-align: center; margin: 8px 0;">
  <h2 style="font-size: 18px; text-transform: uppercase;">HÓA ĐƠN BÁN HÀNG</h2>
</div>
<table style="width: 100%;">
  <tr><td>Mã đơn:</td><td>{{order.orderCode}}</td></tr>
  <tr><td>Ngày:</td><td>{{order.createdAt}}</td></tr>
  <tr><td>Khách hàng:</td><td>{{customerName}}</td></tr>
</table>
<table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
  <tr>
    <th style="border: 1px solid #000; padding: 4px;">STT</th>
    <th style="border: 1px solid #000; padding: 4px;">Tên</th>
    <th style="border: 1px solid #000; padding: 4px;">SL</th>
    <th style="border: 1px solid #000; padding: 4px;">Đơn giá</th>
    <th style="border: 1px solid #000; padding: 4px;">Thành tiền</th>
  </tr>
  {{#each items}}
  <tr>
    <td style="border: 1px solid #000; padding: 4px; text-align: center;">{{index}}</td>
    <td style="border: 1px solid #000; padding: 4px;">{{productName}}</td>
    <td style="border: 1px solid #000; padding: 4px; text-align: right;">{{count}}</td>
    <td style="border: 1px solid #000; padding: 4px; text-align: right;">{{priceFormatted}}</td>
    <td style="border: 1px solid #000; padding: 4px; text-align: right;">{{totalFormatted}}</td>
  </tr>
  {{/each}}
  <tr>
    <td colspan="4" style="border: 1px solid #000; padding: 4px;"><strong>TỔNG CỘNG</strong></td>
    <td style="border: 1px solid #000; padding: 4px; text-align: right;">{{order.totalFormatted}}</td>
  </tr>
</table>
<div style="margin-top: 8px;">Số tiền viết bằng chữ: {{amountToText}}</div>
<div style="margin-top: 16px;">
  <table style="width: 100%;">
    <tr>
      <td style="width: 50%; text-align: center;"><strong>NGƯỜI MUA</strong><br>(Ký, ghi rõ họ tên)</td>
      <td style="width: 50%; text-align: center;"><strong>NGƯỜI BÁN</strong><br>(Ký, ghi rõ họ tên)</td>
    </tr>
  </table>
</div>`;

  readonly templateVars = [
    { group: 'Shop', vars: ['shop.name', 'shop.phone', 'shop.address', 'shop.email', 'shop.bankName'] },
    { group: 'Đơn hàng', vars: ['order.orderCode', 'order.createdAt', 'order.totalFormatted', 'amountToText'] },
    { group: 'Sản phẩm', vars: ['items', 'productName', 'count', 'priceFormatted', 'totalFormatted'] },
    { group: 'QR / Nhận', vars: ['showQr', 'qrCodeUrl', 'sellerName', 'customerName'] },
  ];

  error = '';

  constructor() {
    addIcons({
      homeOutline,
      checkmarkOutline,
      storefrontOutline,
      globeOutline,
      settingsOutline,
      documentTextOutline,
      informationCircleOutline,
      cardOutline,
      cloudUploadOutline,
      personOutline,
      lockClosedOutline,
      cloudDownloadOutline,
      codeSlashOutline,
      eyeOutline,
      downloadOutline,
      refreshOutline,
      chevronForwardOutline,
    });
  }

  get email(): string {
    return (this.auth.session() as any)?.user?.email ?? '';
  }

  get shopId(): string {
    return this.auth.shop()?.id ?? '—';
  }

  get websiteUrl(): string {
    return `https://piopio.app/${this.shopId.slice(0, 8)}/${this.toSlug(this.shopName)}`;
  }

  get todayLabel(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  private toSlug(s: string): string {
    return (s || 'cua-hang')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async ngOnInit(): Promise<void> {
    const shop = this.auth.shop();
    this.shopName = shop?.name ?? '';
    this.shopDescription = shop?.description ?? '';
    this.shopPhone = shop?.phone ?? '';
    this.shopAddress = shop?.address ?? '';
    this.shopWebsite = shop?.website ?? '';
    this.shopLogoUrl = shop?.logo_url ?? '';
    this.bankName = shop?.bank_name ?? '';
    this.bankOwner = shop?.bank_owner ?? '';
    this.bankAccount = shop?.bank_account ?? '';
    this.fullName = this.auth.profile()?.full_name ?? '';

    await this.settingsService.load();
    this.language = this.settingsService.get('language') ?? 'vi';
    this.geminiApiKey = this.settingsService.get('gemini_api_key') ?? '';
    this.currency = this.settingsService.get('currency') ?? 'VND';
    this.dateFormat = this.settingsService.get('date_format') ?? 'dd/MM/yyyy';
    this.timeFormat = this.settingsService.get('time_format') ?? 'HH:mm';
    this.printNote = this.settingsService.get('print_note') ?? '';
    this.emptyRows = this.settingsService.numberValue('invoice_empty_rows', 2);
    this.invoiceTemplate = this.settingsService.get('invoice_template') ?? this.defaultInvoiceTemplate;

    for (const t of this.toggleSettings) {
      const raw = this.settingsService.get(t.key);
      this.toggleValues[t.key] = raw === 'true';
    }
  }

  selectTab(tab: 'shop' | 'website' | 'other' | 'template') {
    this.tab.set(tab);
    this.error = '';
  }

  async save() {
    this.error = '';
    if (this.tab() === 'shop' && !this.shopName.trim()) {
      this.error = 'Tên cửa hàng không được trống.';
      return;
    }
    this.busy.set(true);
    try {
      const shopId = this.auth.shop()?.id;
      if (shopId) {
        await this.sb
          .from('shops')
          .update({
            name: this.shopName.trim(),
            description: this.shopDescription.trim() || null,
            phone: this.shopPhone.trim() || null,
            address: this.shopAddress.trim() || null,
            website: this.shopWebsite.trim() || null,
            logo_url: this.shopLogoUrl.trim() || null,
            bank_name: this.bankName.trim() || null,
            bank_owner: this.bankOwner.trim() || null,
            bank_account: this.bankAccount.trim() || null,
          })
          .eq('id', shopId);
      }
      const userId = (this.auth.session() as any)?.user?.id;
      if (userId) {
        await this.sb.from('profiles').update({ full_name: this.fullName.trim() }).eq('id', userId);
      }

      // Lưu cấu hình khác
      await this.settingsService.set('language', this.language);
      await this.settingsService.set('gemini_api_key', this.geminiApiKey.trim());
      await this.settingsService.set('currency', this.currency);
      await this.settingsService.set('date_format', this.dateFormat);
      await this.settingsService.set('time_format', this.timeFormat);
      await this.settingsService.set('print_note', this.printNote.trim());
      await this.settingsService.set('invoice_empty_rows', String(Number(this.emptyRows ?? 0)));
      for (const t of this.toggleSettings) {
        await this.settingsService.set(t.key, String(!!this.toggleValues[t.key]));
      }
      await this.settingsService.set('invoice_template', this.invoiceTemplate);

      await this.auth.reloadUserData();
      this.toast('Đã lưu cấu hình shop');
    } catch (e: any) {
      this.error = e?.message ?? 'Lưu thất bại.';
    } finally {
      this.busy.set(false);
    }
  }

  async changePassword() {
    this.error = '';
    if (!this.newPassword || this.newPassword.length < 6) {
      this.error = 'Mật khẩu mới phải có ít nhất 6 ký tự.';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.error = 'Xác nhận mật khẩu không khớp.';
      return;
    }
    this.changingPw.set(true);
    try {
      await this.sb.auth.updateUser({ password: this.newPassword });
      this.newPassword = '';
      this.confirmPassword = '';
      this.toast('Đã đổi mật khẩu');
    } catch (e: any) {
      this.error = e?.message ?? 'Đổi mật khẩu thất bại.';
    } finally {
      this.changingPw.set(false);
    }
  }

  resetTemplate() {
    this.invoiceTemplate = this.defaultInvoiceTemplate;
    this.toast('Đã khôi phục mẫu mặc định — nhấn ✓ để lưu');
  }

  exportTemplate() {
    const blob = new Blob([this.invoiceTemplate], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'order-invoice-template.hbs';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  importTemplate(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.invoiceTemplate = String(reader.result ?? '');
      this.toast('Đã nạp template — nhấn ✓ để lưu');
    };
    reader.readAsText(file, 'utf-8');
  }

  async backupData() {
    const shopId = this.auth.shop()?.id;
    if (!this.sb.isConfigured || !shopId) {
      this.toast('Chưa kết nối dữ liệu', 'danger');
      return;
    }
    this.backingUp.set(true);
    try {
      const tables = [
        'products', 'customers', 'money_accounts', 'orders', 'transactions',
        'crm_leads', 'received_notes', 'promotions', 'materials', 'point_transactions',
      ];
      const dump: Record<string, unknown> = {
        exported_at: new Date().toISOString(),
        shop: this.auth.shop(),
      };
      for (const table of tables) {
        const { data, error } = await this.sb.from(table).select('*').eq('shop_id', shopId);
        if (error) {
          console.warn(`backup ${table} skipped:`, error.message);
          dump[table] = [];
          continue;
        }
        dump[table] = data;
      }
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      a.href = url;
      a.download = `piopio-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.toast('Đã tải backup dữ liệu');
    } catch (e: any) {
      this.toast(e?.message ?? 'Backup thất bại', 'danger');
    } finally {
      this.backingUp.set(false);
    }
  }

  async logout() {
    await this.auth.logout();
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  openHome() {
    this.router.navigateByUrl('/home');
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

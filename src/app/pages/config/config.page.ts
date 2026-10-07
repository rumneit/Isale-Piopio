import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
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
  receiptOutline,
  shieldCheckmarkOutline,
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
import {
  DEFAULT_INVOICE_TEMPLATE,
  DEFAULT_RECEIPT_TEMPLATE,
  InvoiceTemplateKind,
  InvoiceTemplateService,
} from '../../core/services/invoice-template.service';

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
  private invoiceTemplates = inject(InvoiceTemplateService);
  private sanitizer = inject(DomSanitizer);

  readonly busy = signal(false);
  readonly backingUp = signal(false);
  readonly changingPw = signal(false);
  readonly templateTab = signal<'edit' | 'preview'>('edit');
  readonly templateKind = signal<InvoiceTemplateKind>('invoice');
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
  bankCode = '';
  /** Danh sách ngân hàng hỗ trợ VietQR (mã dùng cho img.vietqr.io) */
  readonly vietqrBanks = [
    { code: 'mb', name: 'MB Bank (Quân Đội)' },
    { code: 'vietcombank', name: 'Vietcombank' },
    { code: 'vietinbank', name: 'VietinBank' },
    { code: 'bidv', name: 'BIDV' },
    { code: 'techcombank', name: 'Techcombank' },
    { code: 'acb', name: 'ACB' },
    { code: 'vpbank', name: 'VPBank' },
    { code: 'agribank', name: 'Agribank' },
    { code: 'tpb', name: 'TPBank' },
    { code: 'sacombank', name: 'Sacombank' },
    { code: 'vib', name: 'VIB' },
    { code: 'shb', name: 'SHB' },
    { code: 'hdbank', name: 'HDBank' },
    { code: 'msb', name: 'MSB' },
    { code: 'ocb', name: 'OCB' },
    { code: 'seabank', name: 'SeABank' },
    { code: 'eximbank', name: 'Eximbank' },
    { code: 'lpb', name: 'LPBank' },
    { code: 'abbank', name: 'ABBank' },
    { code: 'namabank', name: 'Nam A Bank' },
    { code: 'ncb', name: 'NCB' },
    { code: 'pvcombank', name: 'PVcomBank' },
    { code: 'bacabank', name: 'Bac A Bank' },
    { code: 'kienlongbank', name: 'KienLongBank' },
    { code: 'saigonbank', name: 'SaigonBank' },
    { code: 'vietabank', name: 'VietABank' },
    { code: 'vietbank', name: 'VietBank' },
    { code: 'baoviet', name: 'Bảo Việt Bank' },
  ];

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
    { key: 'allow_negative_stock', label: 'Cho phép bán âm kho' },
    { key: 'hide_materials', label: 'Ẩn tính năng Nguyên Vật Liệu' },
    { key: 'hide_table', label: 'Ẩn tính năng Đặt bàn' },
    { key: 'hide_booking', label: 'Ẩn tính năng Đặt lịch' },
    { key: 'enable_export_note', label: 'Bật chức năng Phiếu Xuất' },
    { key: 'hide_promotion', label: 'Ẩn tính năng Khuyến mại' },
    { key: 'hide_tax', label: 'Ẩn thuế khỏi đơn' },
    { key: 'print_large_invoice', label: 'In hóa đơn dạng Hóa đơn bán hàng (khổ lớn)' },
    { key: 'hide_discount_column', label: 'Ẩn cột chiết khấu khi in đơn' },
    { key: 'hide_product_code', label: 'Ẩn mã sản phẩm khi in đơn' },
    { key: 'profit_latest_cost', label: 'Tính lợi nhuận theo Chi phí mới nhất (không tích sổ tính theo thời điểm lên đơn)' },
    { key: 'sync_cost_from_received', label: 'Đồng bộ Giá Nhập từ Phiếu Nhập' },
    { key: 'stock_by_variant', label: 'Bật Tồn kho cho Phân loại sản phẩm' },
    { key: 'print_qr', label: 'In QR code khi in đơn' },
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
  receiptTemplate = '';
  private savedInvoiceTemplate = '';
  private savedReceiptTemplate = '';
  previewDocument: SafeHtml = '';
  readonly defaultInvoiceTemplate = DEFAULT_INVOICE_TEMPLATE;
  readonly defaultReceiptTemplate = DEFAULT_RECEIPT_TEMPLATE;

  readonly templateVars = [
    { group: 'Shop', vars: ['shop.name', 'shop.phone', 'shop.address', 'shop.email', 'shop.bankName'] },
    { group: 'Đơn hàng', vars: ['order.orderCode', 'order.createdAt', 'order.totalFormatted', 'amountToText'] },
    { group: 'Sản phẩm', vars: ['items', 'productName', 'count', 'priceFormatted', 'totalFormatted'] },
    { group: 'QR / Nhận', vars: ['showQr', 'qrCodeUrl', 'sellerName', 'customerName'] },
    { group: 'Bill', vars: ['order.paidFormatted', 'order.changeFormatted', 'receiptCompact', 'totalWithCurrency'] },
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
      receiptOutline,
      shieldCheckmarkOutline,
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
    this.bankCode = (shop as unknown as { bank_code?: string | null })?.bank_code ?? '';
    this.fullName = this.auth.profile()?.full_name ?? '';

    await this.settingsService.load();
    this.language = this.settingsService.get('language') ?? 'vi';
    this.geminiApiKey = this.settingsService.get('gemini_api_key') ?? '';
    this.currency = this.settingsService.get('currency') ?? 'VND';
    this.dateFormat = this.settingsService.get('date_format') ?? 'dd/MM/yyyy';
    this.timeFormat = this.settingsService.get('time_format') ?? 'HH:mm';
    this.printNote = this.settingsService.get('print_note') ?? '';
    this.emptyRows = this.settingsService.numberValue('invoice_empty_rows', 2);
    this.invoiceTemplate = this.settingsService.get('invoice_template_large')
      ?? this.settingsService.get('invoice_template')
      ?? this.defaultInvoiceTemplate;
    this.receiptTemplate = this.settingsService.get('invoice_template_receipt') ?? this.defaultReceiptTemplate;
    this.savedInvoiceTemplate = this.invoiceTemplate;
    this.savedReceiptTemplate = this.receiptTemplate;
    this.refreshTemplatePreview();

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
            bank_code: this.bankCode.trim() || null,
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

  get activeTemplate(): string {
    return this.templateKind() === 'invoice' ? this.invoiceTemplate : this.receiptTemplate;
  }

  set activeTemplate(value: string) {
    if (this.templateKind() === 'invoice') this.invoiceTemplate = value;
    else this.receiptTemplate = value;
  }

  templateDirty(): boolean {
    return this.templateKind() === 'invoice'
      ? this.invoiceTemplate !== this.savedInvoiceTemplate
      : this.receiptTemplate !== this.savedReceiptTemplate;
  }

  usingDefaultTemplate(): boolean {
    return this.activeTemplate.trim() === this.invoiceTemplates.defaultFor(this.templateKind()).trim();
  }

  selectTemplateKind(kind: InvoiceTemplateKind): void {
    this.templateKind.set(kind);
    this.error = '';
    if (this.templateTab() === 'preview') this.refreshTemplatePreview();
  }

  selectTemplateTab(tab: 'edit' | 'preview'): void {
    this.templateTab.set(tab);
    this.error = '';
    if (tab === 'preview') this.refreshTemplatePreview();
  }

  async saveTemplate(): Promise<void> {
    const kind = this.templateKind();
    const template = this.activeTemplate;
    const validation = this.invoiceTemplates.validate(template);
    if (validation) { this.error = validation; return; }
    this.busy.set(true);
    this.error = '';
    try {
      const key = kind === 'invoice' ? 'invoice_template_large' : 'invoice_template_receipt';
      if (template.trim() === this.invoiceTemplates.defaultFor(kind).trim()) await this.settingsService.remove(key);
      else await this.settingsService.set(key, template);
      // Dọn key đời cũ sau khi mẫu khổ lớn đã được chuyển sang cấu trúc hai template.
      if (kind === 'invoice') await this.settingsService.remove('invoice_template');
      if (kind === 'invoice') this.savedInvoiceTemplate = template;
      else this.savedReceiptTemplate = template;
      this.toast('Đã lưu template hóa đơn');
    } catch (error: any) {
      this.error = error?.message ?? 'Không thể lưu template.';
    } finally {
      this.busy.set(false);
    }
  }

  resetTemplate() {
    this.activeTemplate = this.invoiceTemplates.defaultFor(this.templateKind());
    this.error = '';
    if (this.templateTab() === 'preview') this.refreshTemplatePreview();
    this.toast('Đã dùng mẫu mặc định — nhấn LƯU TEMPLATE để xác nhận');
  }

  exportTemplate() {
    const blob = new Blob([this.activeTemplate], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.invoiceTemplates.filenameFor(this.templateKind());
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  importTemplate(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > this.invoiceTemplates.maxTemplateBytes) {
      this.error = 'File template vượt quá giới hạn 200 KB.';
      input.value = '';
      return;
    }
    if (!/\.(hbs|html|txt)$/i.test(file.name)) {
      this.error = 'Chỉ chấp nhận file .hbs, .html hoặc .txt.';
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? '');
      const validation = this.invoiceTemplates.validate(value);
      if (validation) { this.error = validation; input.value = ''; return; }
      this.activeTemplate = value;
      this.error = '';
      this.toast('Đã nạp template — nhấn ✓ để lưu');
      input.value = '';
    };
    reader.onerror = () => { this.error = 'Không thể đọc file template.'; input.value = ''; };
    reader.readAsText(file, 'utf-8');
  }

  refreshTemplatePreview(): void {
    try {
      const rendered = this.invoiceTemplates.render(
        this.activeTemplate,
        this.invoiceTemplates.previewContext(this.auth.shop(), this.printNote, Number(this.emptyRows ?? 0)),
      );
      this.previewDocument = this.sanitizer.bypassSecurityTrustHtml(
        this.invoiceTemplates.document(rendered, this.templateKind()),
      );
      this.error = '';
    } catch (error: any) {
      this.error = error?.message ?? 'Không thể dựng bản xem trước.';
    }
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
        'crm_leads', 'received_notes', 'promotions', 'materials',
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

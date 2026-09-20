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
  saveOutline,
  personOutline,
  lockClosedOutline,
  cloudDownloadOutline,
} from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { CsvExportService } from '../../core/services/csv-export.service';
import { SettingsService } from '../../core/services/settings.service';

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

  // Cấu hình khác
  pointRate: number | null = 10000;
  lowStockThreshold: number | null = 5;

  // Template hóa đơn
  invoiceTemplate = signal<'80mm' | 'a5' | 'a4'>('80mm');

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
      saveOutline,
      personOutline,
      lockClosedOutline,
      cloudDownloadOutline,
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

  private toSlug(s: string): string {
    return (s || 'cua-hang')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  ngOnInit(): void {
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
    this.settingsService.load().then(() => {
      this.pointRate = this.settingsService.pointRate();
      this.lowStockThreshold = this.settingsService.lowStockThreshold();
    });
  }

  selectTab(tab: 'shop' | 'website' | 'other' | 'template') {
    this.tab.set(tab);
    this.error = '';
  }

  async save() {
    this.error = '';
    if (!this.shopName.trim()) {
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
      if (this.pointRate && Number(this.pointRate) > 0) {
        await this.settingsService.set('point_rate', String(Number(this.pointRate)));
      }
      if (this.lowStockThreshold && Number(this.lowStockThreshold) > 0) {
        await this.settingsService.set('low_stock_threshold', String(Number(this.lowStockThreshold)));
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

  /** Tải toàn bộ dữ liệu của shop về máy dưới dạng JSON */
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

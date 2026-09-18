import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonIcon,
  IonContent,
  IonList,
  IonItem,
  IonInput,
  IonSpinner,
  IonButton,
  IonNote,
  IonLabel,
  ToastController,
} from '@ionic/angular';import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  settingsOutline,
  saveOutline,
  storefrontOutline,
  personOutline,
  logOutOutline,
  informationCircleOutline,
  cloudOutline,
  cloudDownloadOutline,
  lockClosedOutline,
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
    IonBackButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonInput,
    IonSpinner,
    IonButton,
    IonNote,
    IonLabel,
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

  shopName = '';
  fullName = '';
  error = '';

  pointRate: number | null = 10000;
  lowStockThreshold: number | null = 5;

  newPassword = '';
  confirmPassword = '';
  changingPw = signal(false);

  constructor() {
    addIcons({
      settingsOutline,
      saveOutline,
      storefrontOutline,
      personOutline,
      logOutOutline,
      informationCircleOutline,
      cloudOutline,
      cloudDownloadOutline,
      lockClosedOutline,
    });
  }

  ngOnInit(): void {
    this.shopName = this.auth.shop()?.name ?? '';
    this.fullName = this.auth.profile()?.full_name ?? '';
    this.settingsService.load().then(() => {
      this.pointRate = this.settingsService.pointRate();
      this.lowStockThreshold = this.settingsService.lowStockThreshold();
    });
  }

  get email(): string {
    return (this.auth.session() as any)?.user?.email ?? '';
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
        await this.sb.from('shops').update({ name: this.shopName.trim() }).eq('id', shopId);
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
      this.toast('Đã lưu cài đặt');
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

  async logout() {
    await this.auth.logout();
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  readonly backingUp = signal(false);

  /** Tải toàn bộ dữ liệu của shop về máy dưới dạng JSON */
  async backupData() {
    const shopId = this.auth.shop()?.id;
    if (!this.sb.isConfigured || !shopId) {
      this.toastCtrl.create({ message: 'Chưa kết nối dữ liệu', duration: 1600, color: 'danger', position: 'bottom' }).then((t) => t.present());
      return;
    }
    this.backingUp.set(true);
    try {
      const tables = [
        'products',
        'customers',
        'money_accounts',
        'orders',
        'transactions',
        'crm_leads',
        'received_notes',
        'promotions',
        'materials',
        'point_transactions',
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
      this.toastCtrl
        .create({ message: e?.message ?? 'Backup thất bại', duration: 1800, color: 'danger', position: 'bottom' })
        .then((t) => t.present());
    } finally {
      this.backingUp.set(false);
    }
  }

  private async toast(message: string) {
    const t = await this.toastCtrl.create({ message, duration: 1600, color: 'success', position: 'bottom' });
    await t.present();
  }
}

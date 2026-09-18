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
} from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { CsvExportService } from '../../core/services/csv-export.service';

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

  readonly busy = signal(false);

  shopName = '';
  fullName = '';
  error = '';

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
    });
  }

  ngOnInit(): void {
    this.shopName = this.auth.shop()?.name ?? '';
    this.fullName = this.auth.profile()?.full_name ?? '';
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
      await this.auth.reloadUserData();
      this.toast('Đã lưu cài đặt');
    } catch (e: any) {
      this.error = e?.message ?? 'Lưu thất bại.';
    } finally {
      this.busy.set(false);
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
      a.download = `isale-backup-${stamp}.json`;
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

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
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  settingsOutline,
  saveOutline,
  storefrontOutline,
  personOutline,
  logOutOutline,
  informationCircleOutline,
  cloudOutline,
} from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';

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

  private async toast(message: string) {
    const t = await this.toastCtrl.create({ message, duration: 1600, color: 'success', position: 'bottom' });
    await t.present();
  }
}

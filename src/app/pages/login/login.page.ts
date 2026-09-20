import { Component, inject, signal } from '@angular/core';
import {
  IonContent,
  IonInput,
  IonButton,
  IonIcon,
  IonSpinner,
  IonToolbar,
  IonHeader,
  IonTitle,
  IonCheckbox,
  IonButtons,
  IonMenuButton,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  storefrontOutline,
  lockClosedOutline,
  mailOutline,
  personOutline,
  logInOutline,
  personAddOutline,
} from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [
    IonContent,
    IonInput,
    IonButton,
    IonIcon,
    IonSpinner,
    IonToolbar,
    IonHeader,
    IonTitle,
    IonCheckbox,
    IonButtons,
    IonMenuButton,
    FormsModule,
  ],
})
export class LoginPage {
  private auth = inject(AuthService);
  private sb = inject(SupabaseService);
  private router = inject(Router);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  mode = signal<'login' | 'register'>('login');
  lang = signal<'vn' | 'en'>('vn');
  email = '';
  password = '';
  fullName = '';
  remember = true;
  busy = signal(false);
  error = signal('');
  info = signal('');

  constructor() {
    addIcons({
      storefrontOutline,
      lockClosedOutline,
      mailOutline,
      personOutline,
      logInOutline,
      personAddOutline,
    });
  }

  get supabaseMissing(): boolean {
    return !this.sb.isConfigured;
  }

  setLang(lang: 'vn' | 'en') {
    this.lang.set(lang);
  }

  switchMode(mode: 'login' | 'register') {
    this.mode.set(mode);
    this.error.set('');
    this.info.set('');
  }

  async submit() {
    this.error.set('');
    this.info.set('');
    const email = this.email.trim();
    const password = this.password;

    if (!email || !password) {
      this.error.set('Vui lòng nhập Email/Phone và mật khẩu.');
      return;
    }

    this.busy.set(true);
    try {
      if (this.mode() === 'login') {
        await this.auth.login(email, password);
        this.router.navigateByUrl('/home', { replaceUrl: true });
      } else {
        if (!this.fullName.trim()) {
          this.error.set('Vui lòng nhập tên của bạn.');
          return;
        }
        const result = await this.auth.register(email, password, this.fullName.trim());
        if (result?.session) {
          this.router.navigateByUrl('/home', { replaceUrl: true });
        } else {
          this.switchMode('login');
          this.email = email;
          this.info.set(
            'Tài khoản đã được tạo! Kiểm tra hộp thư ' + email + ' để xác nhận email, sau đó đăng nhập bình thường.'
          );
        }
      }
    } catch (e: any) {
      this.error.set(this.translateError(e?.message ?? 'Đăng nhập thất bại.'));
    } finally {
      this.busy.set(false);
    }
  }

  async forgotPassword() {
    const alert = await this.alertCtrl.create({
      header: 'Quên mật khẩu',
      message: 'Nhập email đăng ký — chúng tôi sẽ gửi link đặt lại mật khẩu.',
      inputs: [{ name: 'email', type: 'email', placeholder: 'ban@cuahang.vn', value: this.email }],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Gửi link',
          handler: async (data) => {
            const email = (data?.email ?? '').trim();
            if (!email) return false;
            if (!this.sb.isConfigured) {
              this.error.set('Chưa cấu hình Supabase.');
              return false;
            }
            try {
              await this.sb.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/#/login',
              });
              const t = await this.alertCtrl.create({
                header: 'Đã gửi',
                message: `Kiểm tra hộp thư ${email} và làm theo link đặt lại mật khẩu.`,
                buttons: ['OK'],
              });
              await t.present();
              return true;
            } catch (e: any) {
              this.error.set(e?.message ?? 'Gửi email thất bại.');
              return true;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private translateError(msg: string): string {
    const m = (msg || '').toLowerCase();
    if (m.includes('invalid login credentials')) return 'Email hoặc mật khẩu không đúng.';
    if (m.includes('user already registered')) return 'Email này đã được đăng ký.';
    if (m.includes('password should be at least')) return 'Mật khẩu phải có ít nhất 6 ký tự.';
    if (m.includes('email format')) return 'Email không hợp lệ.';
    if (m.includes('signups not allowed')) return 'Chưa mở đăng ký. Bật Email provider trong Supabase → Authentication.';
    if (m.includes('email not confirmed')) return 'Email chưa xác nhận. Kiểm tra hộp thư để xác nhận.';
    if (m.includes('failed to fetch')) return 'Không kết nối được máy chủ. Kiểm tra cấu hình Supabase.';
    return msg;
  }
}

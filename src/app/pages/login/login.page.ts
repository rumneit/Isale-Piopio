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
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import { storefrontOutline, lockClosedOutline, mailOutline, personOutline, arrowForwardOutline } from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [IonContent, IonInput, IonButton, IonIcon, IonSpinner, IonToolbar, IonHeader, IonTitle, FormsModule],
})
export class LoginPage {
  private auth = inject(AuthService);
  private sb = inject(SupabaseService);
  private router = inject(Router);

  mode = signal<'login' | 'register'>('login');
  email = '';
  password = '';
  fullName = '';
  busy = signal(false);
  error = signal('');

  constructor() {
    addIcons({ storefrontOutline, lockClosedOutline, mailOutline, personOutline, arrowForwardOutline });
  }

  get supabaseMissing(): boolean {
    return !this.sb.isConfigured;
  }

  switchMode(mode: 'login' | 'register') {
    this.mode.set(mode);
    this.error.set('');
  }

  async submit() {
    this.error.set('');
    const email = this.email.trim();
    const password = this.password;

    if (!email || !password) {
      this.error.set('Vui lòng nhập email và mật khẩu.');
      return;
    }

    this.busy.set(true);
    try {
      if (this.mode() === 'login') {
        await this.auth.login(email, password);
      } else {
        if (!this.fullName.trim()) {
          this.error.set('Vui lòng nhập tên của bạn.');
          return;
        }
        await this.auth.register(email, password, this.fullName.trim());
      }
      this.router.navigateByUrl('/home', { replaceUrl: true });
    } catch (e: any) {
      this.error.set(this.translateError(e?.message ?? 'Đăng nhập thất bại.'));
    } finally {
      this.busy.set(false);
    }
  }

  private translateError(msg: string): string {
    const m = (msg || '').toLowerCase();
    if (m.includes('invalid login credentials')) return 'Email hoặc mật khẩu không đúng.';
    if (m.includes('user already registered')) return 'Email này đã được đăng ký.';
    if (m.includes('password should be at least')) return 'Mật khẩu phải có ít nhất 6 ký tự.';
    if (m.includes('email format')) return 'Email không hợp lệ.';
    if (m.includes('failed to fetch')) return 'Không kết nối được máy chủ. Kiểm tra cấu hình Supabase.';
    return msg;
  }
}

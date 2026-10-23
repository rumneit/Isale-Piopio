import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonItem,
  IonInput,
  IonButton,
  IonIcon,
  IonSpinner,
  IonNote,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { lockClosedOutline, keyOutline, logInOutline } from 'ionicons/icons';
import { SupabaseService } from '../../core/services/supabase.service';
import { RECOVERY_HASH_KEY } from '../../core/utils/recovery-link';

@Component({
  selector: 'app-reset-password',
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonItem,
    IonInput,
    IonButton,
    IonIcon,
    IonSpinner,
    IonNote,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Đặt lại mật khẩu</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <div class="app-page-container">
        <div class="app-card">
          <div class="app-card-title">
            <h4><ion-icon name="key-outline" /> Mật khẩu mới</h4>
          </div>

          @if (loading()) {
            <div class="page-loading"><ion-spinner name="crescent" /></div>
          } @else if (!ready()) {
            <div class="form-error">{{ error() }}</div>
            <ion-button expand="block" (click)="goLogin()">
              <ion-icon slot="start" name="log-in-outline" /> Về trang đăng nhập
            </ion-button>
          } @else {
            @if (error()) {
              <div class="form-error">{{ error() }}</div>
            }
            <ion-item lines="full">
              <ion-input
                label="Email"
                labelPlacement="stacked"
                [value]="email()"
                readonly
              />
            </ion-item>
            <ion-item lines="full">
              <ion-input
                label="Mật khẩu mới"
                labelPlacement="stacked"
                type="password"
                autocomplete="new-password"
                [(ngModel)]="password"
                placeholder="Ít nhất 6 ký tự"
              />
            </ion-item>
            <ion-item lines="full">
              <ion-input
                label="Nhập lại mật khẩu mới"
                labelPlacement="stacked"
                type="password"
                autocomplete="new-password"
                [(ngModel)]="confirm"
              />
            </ion-item>

            <ion-note class="reset-hint">
              Sau khi đổi, bạn sẽ được đăng xuất và đăng nhập lại bằng mật khẩu mới.
            </ion-note>

            <ion-button expand="block" size="large" (click)="submit()" [disabled]="busy()">
              @if (busy()) {
                <ion-spinner name="crescent" />
              } @else {
                <ion-icon slot="start" name="lock-closed-outline" /> Lưu mật khẩu mới
              }
            </ion-button>
          }
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 32px 0; }
    .reset-hint { display: block; margin: 14px 4px 18px; font-size: 12.5px; color: var(--app-text-muted); }
    .form-error { margin: 0 0 14px; }
    ion-button { margin-top: 6px; }
  `],
})
export class ResetPasswordPage implements OnInit {
  private sb = inject(SupabaseService);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);

  readonly loading = signal(true);
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly email = signal('');

  password = '';
  confirm = '';

  constructor() {
    addIcons({ lockClosedOutline, keyOutline, logInOutline });
  }

  async ngOnInit(): Promise<void> {
    if (!this.sb.isConfigured) {
      this.error.set('Chưa cấu hình Supabase.');
      this.loading.set(false);
      return;
    }
    try {
      const raw = sessionStorage.getItem(RECOVERY_HASH_KEY) ?? '';
      const params = new URLSearchParams(raw);
      const linkError = params.get('error_description') ?? params.get('error');
      if (linkError) {
        this.error.set(
          'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu gửi lại email.'
        );
        sessionStorage.removeItem(RECOVERY_HASH_KEY);
        return;
      }

      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        const { data, error } = await this.sb.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw error;
        this.email.set(data.user?.email ?? '');
        sessionStorage.removeItem(RECOVERY_HASH_KEY);
        this.ready.set(true);
        return;
      }

      // Người dùng đã đăng nhập sẵn (hoặc link đã được xử lý trước đó).
      const { data } = await this.sb.auth.getSession();
      if (data.session) {
        this.email.set(data.session.user.email ?? '');
        this.ready.set(true);
      } else {
        this.error.set(
          'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu gửi lại email từ trang đăng nhập.'
        );
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Không mở được liên kết đặt lại mật khẩu.');
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    this.error.set('');
    if (!this.password || this.password.length < 6) {
      this.error.set('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (this.password !== this.confirm) {
      this.error.set('Hai lần nhập mật khẩu không khớp.');
      return;
    }
    if (this.password.length > 72) {
      this.error.set('Mật khẩu tối đa 72 ký tự.');
      return;
    }

    this.busy.set(true);
    try {
      const { error } = await this.sb.auth.updateUser({ password: this.password });
      if (error) throw error;
      await this.sb.auth.signOut();
      sessionStorage.removeItem(RECOVERY_HASH_KEY);
      const t = await this.toastCtrl.create({
        message: 'Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới.',
        duration: 2600,
        color: 'success',
        position: 'bottom',
      });
      await t.present();
      this.router.navigateByUrl('/login', { replaceUrl: true });
    } catch (e: any) {
      this.error.set(this.translate(e?.message));
    } finally {
      this.busy.set(false);
    }
  }

  goLogin(): void {
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  private translate(msg?: string): string {
    const m = (msg ?? '').toLowerCase();
    if (m.includes('should be at least')) return 'Mật khẩu phải có ít nhất 6 ký tự.';
    if (m.includes('different from the old')) return 'Mật khẩu mới phải khác mật khẩu cũ.';
    if (m.includes('auth session missing') || m.includes('session_not_found')) {
      return 'Phiên đặt lại mật khẩu đã hết hạn. Hãy yêu cầu gửi lại email.';
    }
    if (m.includes('failed to fetch')) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
    return msg || 'Đổi mật khẩu thất bại.';
  }
}

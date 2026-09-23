import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonInput, IonButton, IonNote, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { lockClosedOutline, saveOutline, eyeOutline, eyeOffOutline } from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-change-password',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonInput, IonButton, IonNote,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/config" /></ion-buttons>
        <ion-title>Đổi mật khẩu</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <div class="app-page-container">
        <div class="app-card">
          <ion-list lines="full">
            <ion-item>
              <ion-input
                label="Mật khẩu mới"
                labelPlacement="stacked"
                [type]="show() ? 'text' : 'password'"
                placeholder="Ít nhất 6 ký tự"
                [value]="password()"
                (ionInput)="password.set($any($event.detail.value))"
              />
            </ion-item>
            <ion-item>
              <ion-input
                label="Nhập lại mật khẩu"
                labelPlacement="stacked"
                [type]="show() ? 'text' : 'password'"
                [value]="confirm()"
                (ionInput)="confirm.set($any($event.detail.value))"
              />
              <ion-button slot="end" fill="clear" (click)="show.set(!show())">
                <ion-icon slot="icon-only" [name]="show() ? 'eye-off-outline' : 'eye-outline'" />
              </ion-button>
            </ion-item>
          </ion-list>
        </div>

        <ion-button expand="block" [disabled]="saving()" (click)="submit()">
          <ion-icon slot="start" name="save-outline" />
          {{ saving() ? 'Đang lưu...' : 'Cập nhật mật khẩu' }}
        </ion-button>

        <ion-note class="page-hint">
          Sau khi đổi mật khẩu, bạn vẫn đang đăng nhập. Hãy dùng mật khẩu mới cho lần đăng nhập sau.
        </ion-note>
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 10px 4px; }
  `],
})
export class ChangePasswordPage {
  private auth = inject(AuthService);
  private toastCtrl = inject(ToastController);

  readonly password = signal('');
  readonly confirm = signal('');
  readonly show = signal(false);
  readonly saving = signal(false);

  constructor() {
    addIcons({ lockClosedOutline, saveOutline, eyeOutline, eyeOffOutline });
  }

  async submit() {
    if (this.password().length < 6) {
      this.toast('Mật khẩu phải có ít nhất 6 ký tự', 'danger');
      return;
    }
    if (this.password() !== this.confirm()) {
      this.toast('Hai mật khẩu không khớp', 'danger');
      return;
    }
    this.saving.set(true);
    try {
      await this.auth.changePassword(this.password());
      this.password.set('');
      this.confirm.set('');
      this.toast('Đã đổi mật khẩu thành công');
    } catch (e: any) {
      this.toast(e?.message ?? 'Đổi mật khẩu thất bại', 'danger');
    } finally {
      this.saving.set(false);
    }
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 2200, color, position: 'bottom' });
    await t.present();
  }
}

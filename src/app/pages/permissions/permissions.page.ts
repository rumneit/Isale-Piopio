import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonToggle, IonButton,
  IonSelect, IonSelectOption, AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { lockClosedOutline, personOutline, personAddOutline, trashOutline } from 'ionicons/icons';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/services/auth.service';
import { Profile } from '../../core/models/models';
import { PERMISSION_DEFS, ROLES, presetsForRole } from '../../core/permissions';

@Component({
  selector: 'app-permissions',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonToggle, IonButton,
    IonSelect, IonSelectOption,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /><ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons>
        <ion-title>Phân quyền</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      @if (loading()) {
        <div class="page-loading"><ion-spinner name="crescent" /></div>
      } @else {
        <div class="app-page-container">
          <div class="app-banner-warning">
            <ion-icon name="lock-closed-outline" />
            <span>
              Quyền áp dụng cho nhân viên (role "staff"). Chủ cửa hàng luôn có toàn quyền.
              Bật/tắt rồi nhấn nút lưu của từng người.
            </span>
          </div>

          <div class="perm-actions">
            <ion-button expand="block" fill="outline" (click)="addMember()">
              <ion-icon slot="start" name="person-add-outline" /> Thêm nhân viên
            </ion-button>
            <ion-note>
              Nhân viên tự đăng ký tài khoản trước, sau đó chủ cửa hàng thêm bằng email.
              Xoá khỏi cửa hàng sẽ thu hồi toàn bộ quyền truy cập dữ liệu cửa hàng.
            </ion-note>
          </div>

          @for (m of staff(); track m.id) {
            <div class="app-card">
              <div class="perm-head">
                <div class="perm-avatar">{{ (m.full_name || '?') | uppercase }}</div>
                <div class="perm-info">
                  <h3>{{ m.full_name ?? 'Chưa đặt tên' }}</h3>
                  <ion-select
                    interface="popover"
                    [value]="m.role ?? 'staff'"
                    (ionChange)="changeRole(m, $any($event.detail.value))"
                    class="perm-role"
                    aria-label="Vai trò"
                  >
                    @for (r of roles; track r.value) {
                      <ion-select-option [value]="r.value">{{ r.label }}</ion-select-option>
                    }
                  </ion-select>
                </div>
                <ion-button size="small" fill="outline" (click)="savePermissions(m)">Lưu</ion-button>
                <ion-button
                  size="small"
                  fill="clear"
                  color="danger"
                  aria-label="Xoá khỏi cửa hàng"
                  title="Xoá khỏi cửa hàng"
                  (click)="removeMember(m)"
                >
                  <ion-icon slot="icon-only" name="trash-outline" />
                </ion-button>
              </div>

              <ion-list lines="full">
                @for (p of permissionDefs; track p.key) {
                  <ion-item>
                    <ion-toggle
                      [checked]="hasPerm(m, p.key)"
                      (ionChange)="setPerm(m, p.key, $any($event.detail.checked))"
                      [disabled]="m.role === 'owner'"
                    >
                      <ion-label>
                        {{ p.label }}
                        @if (m.role === 'owner') {
                          <ion-note>Bật sẵn cho chủ cửa hàng</ion-note>
                        }
                      </ion-label>
                    </ion-toggle>
                  </ion-item>
                }
              </ion-list>
            </div>
          }

          @if (staff().length === 0) {
            <div class="app-empty">
              <div><ion-icon name="person-outline" /></div>
              Chưa có nhân viên nào trong cửa hàng
            </div>
          }
        </div>
      }
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .perm-head { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .perm-avatar { width: 42px; height: 42px; border-radius: 50%; background: rgba(var(--ion-color-secondary-rgb), 0.15); color: var(--ion-color-secondary); display: flex; align-items: center; justify-content: center; font-weight: 700; }
    .perm-head h3 { margin: 0; font-size: 15px; font-weight: 700; color: var(--app-text); }
    .perm-head p { margin: 0; font-size: 12px; color: var(--app-text-muted); }
    .perm-info { flex: 1; min-width: 0; }
    .perm-role { font-size: 12.5px; max-width: 220px; margin-top: 2px; --padding-start: 0; }
    .perm-head ion-button { margin-left: auto; }
    .perm-head ion-button + ion-button { margin-left: 0; }
    .perm-actions { margin: 0 0 14px; }
    .perm-actions ion-note { display: block; margin: 6px 4px 0; font-size: 12px; color: var(--app-text-muted); }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-note { font-size: 11px; color: var(--app-text-muted); display: block; }
  `],
})
export class PermissionsPage implements OnInit {
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly permissionDefs = PERMISSION_DEFS;
  readonly roles = ROLES;
  readonly staff = signal<Profile[]>([]);
  readonly loading = signal(true);

  constructor() {
    addIcons({ lockClosedOutline, personOutline, personAddOutline, trashOutline });
  }

  ngOnInit(): void { this.load(); }

  async load() {
    const shopId = this.auth.shop()?.id;
    if (!this.sb.isConfigured || !shopId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const { data, error } = await this.sb
        .from('profiles')
        .select('*')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Profile[];
      this.staff.set(rows.filter((p) => p.role !== 'owner'));
    } catch (e: any) {
      console.error('load permissions failed', e);
      this.staff.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private permsOf(m: Profile): Record<string, boolean> {
    return (m as any).permissions && typeof (m as any).permissions === 'object'
      ? ((m as any).permissions as Record<string, boolean>)
      : {};
  }

  hasPerm(m: Profile, key: string): boolean {
    if (m.role === 'owner') return true;
    return !!this.permsOf(m)[key];
  }

  setPerm(m: Profile, key: string, value: boolean) {
    const perms = { ...this.permsOf(m), [key]: value };
    (m as any).permissions = perms;
  }

  /** Đổi vai trò → áp preset quyền chuẩn của vai trò đó. */
  changeRole(m: Profile, role: string) {
    m.role = role;
    if (role === 'owner') {
      (m as any).permissions = presetsForRole('owner');
    } else {
      (m as any).permissions = presetsForRole(role);
    }
    this.staff.update((list) => [...list]);
  }

  async addMember() {
    const shopId = this.auth.shop()?.id;
    if (!shopId) {
      await this.toast('Chưa xác định được cửa hàng.', 'danger');
      return;
    }
    const alert = await this.alertCtrl.create({
      header: 'Thêm nhân viên',
      message: 'Nhập email tài khoản nhân viên đã đăng ký. Quyền được đặt theo vai trò và có thể sửa sau.',
      inputs: [
        { name: 'email', type: 'email', placeholder: 'nhanvien@cuahang.vn' },
        { name: 'role', type: 'radio', label: 'Nhân viên', value: 'staff', checked: true },
        { name: 'role', type: 'radio', label: 'Quản lý kho', value: 'manager' },
        { name: 'role', type: 'radio', label: 'Nhân viên kho (Picker)', value: 'picker' },
        { name: 'role', type: 'radio', label: 'Kế toán', value: 'accountant' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Thêm',
          handler: (data) => {
            void this.doAddMember(shopId, data);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async doAddMember(shopId: string, data: any): Promise<void> {
    const email = String(data?.email ?? '').trim();
    const role = String(data?.role ?? 'staff');
    if (!email || !email.includes('@')) {
      await this.toast('Email không hợp lệ.', 'danger');
      return;
    }
    try {
      const { error } = await this.sb.client.rpc('inv_add_shop_member', {
        p_shop: shopId,
        p_email: email,
        p_role: role,
      });
      if (error) throw new Error(this.rpcMessage(error));
      await this.toast(`Đã thêm ${email} vào cửa hàng.`);
      await this.load();
    } catch (e: any) {
      await this.toast(e?.message ?? 'Thêm nhân viên thất bại.', 'danger');
    }
  }

  async removeMember(m: Profile) {
    const shopId = this.auth.shop()?.id;
    if (!shopId) return;
    const alert = await this.alertCtrl.create({
      header: 'Xoá khỏi cửa hàng?',
      message: `${m.full_name ?? 'Nhân viên này'} sẽ mất toàn bộ quyền truy cập dữ liệu cửa hàng. Dữ liệu của cửa hàng không bị xoá.`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xoá',
          role: 'destructive',
          handler: () => {
            void this.doRemoveMember(shopId, m);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async doRemoveMember(shopId: string, m: Profile): Promise<void> {
    try {
      const { error } = await this.sb.client.rpc('inv_remove_shop_member', {
        p_shop: shopId,
        p_profile: m.id,
      });
      if (error) throw new Error(this.rpcMessage(error));
      await this.toast(`Đã xoá ${m.full_name ?? 'nhân viên'} khỏi cửa hàng.`);
      await this.load();
    } catch (e: any) {
      await this.toast(e?.message ?? 'Xoá nhân viên thất bại.', 'danger');
    }
  }

  private rpcMessage(error: any): string {
    if (error?.code === 'PGRST202' || /inv_add_shop_member|inv_remove_shop_member|schema cache/i.test(error?.message ?? '')) {
      return 'Cơ sở dữ liệu chưa có migration v44. Hãy cập nhật database trước khi quản lý nhân viên.';
    }
    return error?.message ?? 'Thao tác thất bại.';
  }

  async savePermissions(m: Profile) {
    try {
      const { error } = await this.sb
        .from('profiles')
        .update({ permissions: this.permsOf(m), role: m.role ?? 'staff' })
        .eq('id', m.id)
        .eq('shop_id', this.auth.shop()!.id);
      // Supabase trả lỗi trong `error`, không throw — trước đây lỗi bị nuốt và
      // UI vẫn báo "Đã lưu quyền" dù quyền chưa hề đổi.
      if (error) throw error;
      this.toast(`Đã lưu quyền cho ${m.full_name}`);
    } catch (e: any) {
      this.toast(e?.message ?? 'Lưu thất bại', 'danger');
    }
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

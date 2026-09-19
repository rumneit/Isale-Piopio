import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonToggle, IonButton, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { lockClosedOutline, personOutline } from 'ionicons/icons';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/services/auth.service';
import { Profile } from '../../core/models/models';

const PERMISSION_DEFS = [
  { key: 'sell', label: 'Bán hàng & Đơn hàng' },
  { key: 'inventory', label: 'Kho & Sản phẩm' },
  { key: 'money', label: 'Thu chi & Sổ tiền' },
  { key: 'report', label: 'Báo cáo' },
  { key: 'crm', label: 'CRM' },
];

@Component({
  selector: 'app-permissions',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonToggle, IonButton,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /></ion-buttons>
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

          @for (m of staff(); track m.id) {
            <div class="app-card">
              <div class="perm-head">
                <div class="perm-avatar">{{ (m.full_name || '?') | uppercase }}</div>
                <div>
                  <h3>{{ m.full_name ?? 'Chưa đặt tên' }}</h3>
                  <p>{{ m.role === 'owner' ? 'Chủ cửa hàng' : 'Nhân viên' }}</p>
                </div>
                <ion-button size="small" fill="outline" (click)="savePermissions(m)">Lưu</ion-button>
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
    .perm-head ion-button { margin-left: auto; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-note { font-size: 11px; color: var(--app-text-muted); display: block; }
  `],
})
export class PermissionsPage implements OnInit {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private toastCtrl = inject(ToastController);

  readonly permissionDefs = PERMISSION_DEFS;
  readonly staff = signal<Profile[]>([]);
  readonly loading = signal(true);

  constructor() {
    addIcons({ lockClosedOutline, personOutline });
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

  async savePermissions(m: Profile) {
    try {
      await this.sb
        .from('profiles')
        .update({ permissions: this.permsOf(m) })
        .eq('id', m.id)
        .eq('shop_id', this.auth.shop()!.id);
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

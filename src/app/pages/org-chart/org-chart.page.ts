import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonSpinner, IonBadge, IonNote,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { personOutline, shieldCheckmarkOutline, businessOutline } from 'ionicons/icons';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/services/auth.service';
import { Profile } from '../../core/models/models';

@Component({
  selector: 'app-org-chart',
  imports: [CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent, IonSpinner, IonBadge, IonNote],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /></ion-buttons>
        <ion-title>Sơ đồ tổ chức</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      @if (loading()) {
        <div class="page-loading"><ion-spinner name="crescent" /></div>
      } @else {
        <div class="app-page-container">
          <div class="org-root">
            <div class="org-box org-owner">
              <ion-icon name="shield-checkmark-outline" />
              <div class="org-name">{{ ownerName }}</div>
              <div class="org-role">Chủ cửa hàng</div>
            </div>
            <div class="org-line"></div>

            <div class="org-branch">
              @if (staffMembers.length === 0) {
                <div class="org-box org-leaf">
                  <ion-icon name="business-outline" />
                  <div class="org-name">{{ auth.shop()?.name ?? 'Cửa hàng' }}</div>
                  <div class="org-role">Chưa có nhân viên</div>
                </div>
              }
              @for (m of staffMembers; track m.id) {
                <div class="org-box org-leaf">
                  <ion-icon name="person-outline" />
                  <div class="org-name">{{ m.full_name ?? 'Chưa đặt tên' }}</div>
                  <div class="org-role">{{ roleLabel(m.role) }}</div>
                  @if (m.id === auth.session()?.user?.id) {
                    <ion-badge color="primary">Bạn</ion-badge>
                  }
                </div>
              }
            </div>
          </div>
          <ion-note class="page-hint">Sơ đồ hiển thị theo thành viên đã tham gia cửa hàng</ion-note>
        </div>
      }
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .org-root { display: flex; flex-direction: column; align-items: center; padding-top: 10px; }
    .org-box { background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 14px; padding: 14px 20px; text-align: center; min-width: 160px; }
    .org-owner { border: 2px solid var(--ion-color-primary); }
    .org-owner ion-icon { font-size: 28px; color: var(--ion-color-primary); }
    .org-leaf ion-icon { font-size: 24px; color: var(--ion-color-secondary); }
    .org-name { font-weight: 700; font-size: 14.5px; color: var(--app-text); margin-top: 4px; }
    .org-role { font-size: 12px; color: var(--app-text-muted); margin-top: 2px; }
    .org-line { width: 2px; height: 26px; background: var(--app-border); }
    .org-branch { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; padding-top: 12px; border-top: 2px solid var(--app-border); }
    .org-branch .org-leaf { display: flex; flex-direction: column; align-items: center; }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 14px; }
  `],
})
export class OrgChartPage implements OnInit {
  private sb = inject(SupabaseService);
  readonly auth = inject(AuthService);

  readonly members = signal<Profile[]>([]);
  readonly loading = signal(true);

  constructor() {
    addIcons({ personOutline, shieldCheckmarkOutline, businessOutline });
  }

  get ownerName(): string {
    const owner = this.members().find((m) => m.role === 'owner');
    return owner?.full_name ?? this.auth.displayName();
  }

  get staffMembers(): Profile[] {
    return this.members().filter((m) => m.role !== 'owner');
  }

  ngOnInit(): void { this.load(); }

  async load() {
    const shopId = this.auth.shop()?.id;
    if (!this.sb.isConfigured || !shopId) {
      this.loading.set(false);
      return;
    }
    try {
      const { data, error } = await this.sb.from('profiles').select('*').eq('shop_id', shopId).order('created_at');
      if (error) throw error;
      this.members.set((data ?? []) as Profile[]);
    } catch (e) {
      console.error('load org failed', e);
    } finally {
      this.loading.set(false);
    }
  }

  roleLabel(role: string | null): string {
    return role === 'owner' ? 'Chủ cửa hàng' : role === 'manager' ? 'Quản lý' : 'Nhân viên';
  }
}

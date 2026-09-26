import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonButton, IonRefresher,
  IonRefresherContent, AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { timeOutline, logInOutline, logOutOutline } from 'ionicons/icons';
import { ShopTableService } from '../../core/services/shop-table.service';
import { AuthService } from '../../core/services/auth.service';

interface Shift {
  id: string;
  staff_name: string;
  opened_at: string;
  closed_at: string | null;
  opening_note: string | null;
  closing_note: string | null;
}

@Component({
  selector: 'app-shift',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonButton,
    IonRefresher, IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /><ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons>
        <ion-title>Ca làm việc</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($any($event))">
        <ion-refresher-content />
      </ion-refresher>

      <div class="app-page-container">
        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else {
          @if (openShift(); as os) {
            <div class="app-card shift-open">
              <div class="shift-head">
                <ion-icon name="time-outline" color="success" />
                <div>
                  <h3>Ca đang mở — {{ os.staff_name || auth.displayName() }}</h3>
                  <p>Bắt đầu {{ os.opened_at | date: 'HH:mm dd/MM' }}</p>
                </div>
              </div>
              @if (os.opening_note) { <p class="shift-note">{{ os.opening_note }}</p> }
              <ion-button expand="block" color="danger" fill="outline" (click)="closeShift(os)">
                <ion-icon slot="start" name="log-out-outline" />
                Kết thúc ca
              </ion-button>
            </div>
          } @else {
            <div class="app-card">
              <div class="shift-empty">
                <ion-icon name="log-in-outline" />
                <p>Chưa mở ca. Mở ca để bắt đầu theo dõi bán hàng hôm nay.</p>
              </div>
              <ion-button expand="block" (click)="startShift()">
                <ion-icon slot="start" name="log-in-outline" />
                Mở ca làm việc
              </ion-button>
            </div>
          }

          <div class="app-card">
            <div class="app-card-title"><h4><ion-icon name="time-outline" /> Lịch sử ca</h4></div>
            @if (items().length === 0) {
              <div class="app-empty">Chưa có ca nào trước đó</div>
            } @else {
              <ion-list lines="full">
                @for (s of items(); track s.id) {
                  <ion-item>
                    <ion-label>
                      <h3>{{ s.staff_name || 'Nhân viên' }} — {{ s.opened_at | date: 'dd/MM' }}</h3>
                      <p>
                        {{ s.opened_at | date: 'HH:mm' }}
                        @if (s.closed_at) { → {{ s.closed_at | date: 'HH:mm' }} }
                        @if (s.closing_note) { · {{ s.closing_note }} }
                      </p>
                    </ion-label>
                    <ion-badge slot="end" [color]="s.closed_at ? 'medium' : 'success'">
                      {{ s.closed_at ? 'Đã đóng' : 'Đang mở' }}
                    </ion-badge>
                  </ion-item>
                }
              </ion-list>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .shift-open { border: 1px solid rgba(45, 213, 91, 0.4); }
    .shift-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
    .shift-head ion-icon { font-size: 30px; }
    .shift-head h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--app-text); }
    .shift-head p { margin: 2px 0 0; font-size: 12.5px; color: var(--app-text-muted); }
    .shift-note { font-size: 13px; color: var(--app-text-muted); margin: 0 0 10px; }
    .shift-empty { text-align: center; color: var(--app-text-muted); padding: 10px 0 16px; font-size: 13.5px; }
    .shift-empty ion-icon { font-size: 36px; margin-bottom: 6px; opacity: 0.5; }
    .shift-empty p { margin: 0; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
  `],
})
export class ShiftPage implements OnInit {
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  readonly svc = inject(ShopTableService);
  readonly auth = inject(AuthService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly items = signal<Shift[]>([]);
  readonly loading = signal(true);

  constructor() {
    addIcons({ timeOutline, logInOutline, logOutOutline });
  }

  ngOnInit(): void { this.load(); }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.svc.list<Shift>('shifts', 'opened_at', false));
    } catch (e: any) {
      console.error('load shifts failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  readonly openShiftData = signal<Shift | null>(null);
  openShift(): Shift | null { return this.openShiftData(); }

  private recomputeOpen() {
    this.openShiftData.set(this.items().find((s) => !s.closed_at) ?? null);
  }

  async startShift() {
    const alert = await this.alertCtrl.create({
      header: 'Mở ca làm việc',
      inputs: [{ name: 'note', type: 'text', placeholder: 'Ghi chú đầu ca (tùy chọn)' }],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Mở ca',
          handler: async (data) => {
            try {
              await this.svc.create('shifts', {
                staff_name: this.auth.displayName(),
                opening_note: data?.note?.trim() || null,
              });
              this.toast('Đã mở ca');
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Mở ca thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async closeShift(shift: Shift) {
    const alert = await this.alertCtrl.create({
      header: 'Kết thúc ca',
      message: `Ca bắt đầu ${new Date(shift.opened_at).toLocaleString('vi-VN')}`,
      inputs: [{ name: 'note', type: 'text', placeholder: 'Ghi chú cuối ca (tùy chọn)' }],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Kết thúc',
          handler: async (data) => {
            try {
              await this.svc.update('shifts', shift.id, {
                closed_at: new Date().toISOString(),
                closing_note: data?.note?.trim() || null,
              });
              this.toast('Đã kết thúc ca');
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

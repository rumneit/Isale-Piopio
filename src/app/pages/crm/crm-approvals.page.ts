import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonFab, IonFabButton,
  IonSegment, IonSegmentButton, IonRefresher, IonRefresherContent, IonButton,
  AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, checkmarkDoneOutline, closeCircleOutline, timeOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { CrmDealsService, CrmApproval } from '../../core/services/crm-deals.service';

@Component({
  selector: 'app-crm-approvals',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonFab,
    IonFabButton, IonSegment, IonSegmentButton, IonRefresher, IonRefresherContent, IonButton,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/crm" /><ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons>
        <ion-title>Phê duyệt CRM</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="filter()" (ionChange)="onFilter($any($event.detail.value))">
          <ion-segment-button value="pending">Chờ duyệt ({{ pendingCount() }})</ion-segment-button>
          <ion-segment-button value="all">Tất cả</ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($any($event))">
        <ion-refresher-content />
      </ion-refresher>
      <div class="app-page-container">
        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else if (items().length === 0) {
          <div class="app-empty">
            <div><ion-icon name="shield-checkmark-outline" /></div>
            Không có yêu cầu phê duyệt nào.
          </div>
        } @else {
          <div class="app-card">
            <ion-list lines="full">
              @for (a of items(); track a.id) {
                <ion-item>
                  <ion-icon slot="start" [name]="statusIcon(a.status)" [color]="statusColor(a.status)" />
                  <ion-label>
                    <h3>{{ a.title }}</h3>
                    <p>{{ a.requested_by ?? '—' }} · {{ a.created_at | date: 'dd/MM HH:mm' }}</p>
                    @if (a.reason) { <p>Lý do: {{ a.reason }}</p> }
                  </ion-label>
                  <ion-badge slot="end" color="tertiary">{{ formatMoney(a.amount) }}</ion-badge>
                  @if (a.status === 'pending') {
                    <ion-button slot="end" fill="clear" color="success" (click)="decide(a, true)">
                      <ion-icon slot="icon-only" name="checkmark-done-outline" />
                    </ion-button>
                    <ion-button slot="end" fill="clear" color="danger" (click)="decide(a, false)">
                      <ion-icon slot="icon-only" name="close-circle-outline" />
                    </ion-button>
                  }
                </ion-item>
              }
            </ion-list>
          </div>
        }
      </div>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="openAdd()"><ion-icon name="add-outline" /></ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
  `],
})
export class CrmApprovalsPage implements OnInit {
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  private service = inject(CrmDealsService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly items = signal<CrmApproval[]>([]);
  readonly loading = signal(true);
  readonly filter = signal<'pending' | 'all'>('pending');
  readonly pendingCount = computed(() => this.items().filter((a) => a.status === 'pending').length);

  constructor() {
    addIcons({ addOutline, checkmarkDoneOutline, closeCircleOutline, timeOutline, shieldCheckmarkOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.service.listApprovals(this.filter()));
    } catch (e: any) {
      console.error('load approvals failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async onFilter(value: any) {
    this.filter.set(value);
    await this.load();
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  statusIcon(status: string): string {
    return { pending: 'time-outline', approved: 'checkmark-done-outline', rejected: 'close-circle-outline' }[status] ?? 'time-outline';
  }

  statusColor(status: string): string {
    return { pending: 'warning', approved: 'success', rejected: 'danger' }[status] ?? 'medium';
  }

  async openAdd() {
    const alert = await this.alertCtrl.create({
      header: 'Tạo yêu cầu phê duyệt',
      inputs: [
        { name: 'title', type: 'text', placeholder: 'Nội dung (VD: Giảm giá 10% đơn DH-001)' },
        { name: 'amount', type: 'number', placeholder: 'Giá trị liên quan (₫)', value: '0' },
        { name: 'reason', type: 'text', placeholder: 'Lý do' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Gửi',
          handler: async (data) => {
            if (!data?.title?.trim()) {
              this.toast('Vui lòng nhập nội dung', 'danger');
              return false;
            }
            try {
              await this.service.createApproval({
                title: data.title.trim(),
                amount: Number(data.amount ?? 0),
                reason: data.reason?.trim() || null,
                requested_by: 'Nhân viên',
              });
              this.toast('Đã gửi yêu cầu');
              this.filter.set('pending');
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Gửi thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async decide(a: CrmApproval, approved: boolean) {
    const alert = await this.alertCtrl.create({
      header: approved ? 'Phê duyệt' : 'Từ chối',
      message: a.title,
      inputs: [{ name: 'reason', type: 'text', placeholder: approved ? 'Ghi chú (tùy chọn)' : 'Lý do từ chối' }],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: approved ? 'Duyệt' : 'Từ chối',
          handler: async (data) => {
            try {
              await this.service.decideApproval(a.id, approved, data?.reason?.trim() || null);
              this.toast(approved ? 'Đã phê duyệt' : 'Đã từ chối');
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

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

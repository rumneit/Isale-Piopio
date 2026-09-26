import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonButton, IonSearchbar,
  IonFab, IonFabButton, IonRefresher, IonRefresherContent,
  AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, briefcaseOutline, trashOutline, trendingUpOutline, funnelOutline } from 'ionicons/icons';
import { CrmDealsService, CrmDeal } from '../../core/services/crm-deals.service';

@Component({
  selector: 'app-crm-deals',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonButton,
    IonSearchbar, IonFab, IonFabButton, IonRefresher, IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/crm" /><ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons>
        <ion-title>Cơ hội bán hàng</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar placeholder="Tìm cơ hội" [debounce]="300" (ionInput)="onSearch($any($event))" />
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
          <div class="app-card">
            <div class="deal-summary">
              <div>
                <span class="muted">Tổng giá trị</span>
                <strong>{{ formatMoney(totalValue()) }}</strong>
              </div>
              <div>
                <span class="muted">Dự báo có trọng số</span>
                <strong class="forecast">{{ formatMoney(forecast()) }}</strong>
              </div>
            </div>
          </div>

          <div class="app-card">
            <h4 class="section-title"><ion-icon name="funnel-outline" /> Pipeline theo giai đoạn</h4>
            @for (s of pipeline(); track s.stage) {
              <div class="pipe-row">
                <span>{{ service.stageLabel(s.stage) }}</span>
                <span class="muted">{{ s.count }} · {{ formatMoney(s.amount) }}</span>
              </div>
            }
          </div>

          @if (items().length === 0) {
            <div class="app-empty">
              <div><ion-icon name="briefcase-outline" /></div>
              Chưa có cơ hội bán hàng. Nhấn + để tạo.
            </div>
          } @else {
            <div class="app-card">
              <ion-list lines="full">
                @for (d of items(); track d.id) {
                  <ion-item button (click)="openEdit(d)" detail="false">
                    <ion-icon slot="start" name="briefcase-outline" color="primary" />
                    <ion-label>
                      <h3>{{ d.title }}</h3>
                      <p>{{ service.stageLabel(d.stage) }} · {{ d.probability }}% · {{ d.owner_name ?? '—' }}</p>
                    </ion-label>
                    <ion-badge slot="end" [color]="stageColor(d.stage)">{{ formatMoney(d.amount) }}</ion-badge>
                  </ion-item>
                }
              </ion-list>
            </div>
          }
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
    .deal-summary { display: flex; gap: 28px; }
    .deal-summary > div { display: flex; flex-direction: column; }
    .deal-summary strong { font-size: 19px; color: var(--app-text); }
    .deal-summary .forecast { color: var(--ion-color-primary); }
    .muted { font-size: 11.5px; color: var(--app-text-muted); }
    .section-title { display: flex; align-items: center; gap: 6px; margin: 0 0 10px; font-size: 14px; font-weight: 700; color: var(--app-text); }
    .pipe-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13.5px; color: var(--app-text); border-bottom: 1px dashed var(--app-border); }
    .pipe-row:last-child { border-bottom: none; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
  `],
})
export class CrmDealsPage implements OnInit {
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  readonly service = inject(CrmDealsService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly items = signal<CrmDeal[]>([]);
  readonly loading = signal(true);
  search = '';

  readonly totalValue = computed(() =>
    this.items().reduce((s, d) => s + (Number(d.amount) || 0), 0)
  );
  readonly forecast = computed(() => CrmDealsService.weightedForecast(this.items()));
  readonly pipeline = computed(() => CrmDealsService.pipelineByStage(this.items()));

  constructor() {
    addIcons({ addOutline, briefcaseOutline, trashOutline, trendingUpOutline, funnelOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.service.list('all', this.search));
    } catch (e: any) {
      console.error('load deals failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async onSearch(ev: CustomEvent) {
    this.search = (ev.detail as any).value ?? '';
    await this.load();
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  stageColor(stage: string): string {
    return { new: 'medium', contacting: 'primary', quoted: 'tertiary', won: 'success', lost: 'danger' }[stage] ?? 'medium';
  }

  async openAdd() {
    const alert = await this.alertCtrl.create({
      header: 'Thêm cơ hội',
      inputs: [
        { name: 'title', type: 'text', placeholder: 'Tên cơ hội (VD: Bán 50 thùng trà)' },
        { name: 'amount', type: 'number', placeholder: 'Giá trị (₫)', value: '0' },
        { name: 'probability', type: 'number', placeholder: 'Xác suất (%)', value: '20' },
        { name: 'owner_name', type: 'text', placeholder: 'Người phụ trách' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Thêm',
          handler: async (data) => {
            if (!data?.title?.trim()) {
              this.toast('Vui lòng nhập tên cơ hội', 'danger');
              return false;
            }
            try {
              await this.service.create({
                title: data.title.trim(),
                amount: Number(data.amount ?? 0),
                probability: Math.min(100, Math.max(0, Number(data.probability ?? 20))),
                stage: 'new',
                owner_name: data.owner_name?.trim() || null,
              });
              this.toast('Đã thêm cơ hội');
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Thêm thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async openEdit(d: CrmDeal) {
    const alert = await this.alertCtrl.create({
      header: 'Sửa cơ hội',
      inputs: [
        { name: 'title', type: 'text', value: d.title },
        { name: 'amount', type: 'number', value: String(d.amount ?? 0) },
        { name: 'probability', type: 'number', value: String(d.probability ?? 20) },
        { name: 'stage', type: 'text', value: d.stage, placeholder: 'new/contacting/quoted/won/lost' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: async () => {
            try {
              await this.service.remove(d.id);
              this.toast('Đã xóa');
              await this.load();
            } catch (e: any) {
              this.toast(e?.message ?? 'Xóa thất bại', 'danger');
            }
            return true;
          },
        },
        {
          text: 'Lưu',
          handler: async (data) => {
            if (!data?.title?.trim()) {
              this.toast('Tên không được trống', 'danger');
              return false;
            }
            try {
              await this.service.update(d.id, {
                title: data.title.trim(),
                amount: Number(data.amount ?? 0),
                probability: Math.min(100, Math.max(0, Number(data.probability ?? 20))),
                stage: data.stage ?? d.stage,
              });
              this.toast('Đã lưu');
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Lưu thất bại', 'danger');
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

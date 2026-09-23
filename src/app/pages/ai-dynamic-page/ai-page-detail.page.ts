import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonSpinner, IonNote, IonButton, IonRefresher,
  IonRefresherContent, IonBadge, IonCard, IonCardContent, IonCardTitle, IonCardHeader,
  AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  gridOutline, trashOutline, warningOutline, refreshOutline, analyticsOutline,
  barChartOutline, pricetagOutline,
} from 'ionicons/icons';
import { AiPagesService, AiPage } from '../../core/services/ai-pages.service';
import { AiWidget, formatMetric } from '../../core/ai-pages';

interface RenderedWidget {
  widget: AiWidget;
  value?: number;
  rows?: Array<{ key: string; count: number; total: number }>;
}

/**
 * Chi tiết trang động: chạy cấu hình trên DỮ LIỆU THẬT và hiển thị
 * KPI / bảng / biểu đồ thanh.
 */
@Component({
  selector: 'app-ai-page-detail',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonSpinner, IonNote, IonButton, IonRefresher,
    IonRefresherContent, IonBadge, IonCard, IonCardContent, IonCardTitle, IonCardHeader,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/ai-dynamic-page" /><ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons>
        <ion-title>{{ page()?.name ?? 'Trang động' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="run()"><ion-icon slot="icon-only" name="refresh-outline" /></ion-button>
          <ion-button color="danger" (click)="remove()"><ion-icon slot="icon-only" name="trash-outline" /></ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($any($event))">
        <ion-refresher-content />
      </ion-refresher>
      <div class="app-page-container">
        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else if (!page()) {
          <div class="app-empty">
            <div><ion-icon name="warning-outline" /></div>
            Không tìm thấy trang.
          </div>
        } @else {
          @if (page()!.prompt) {
            <ion-note class="page-hint">"{{ page()!.prompt }}"</ion-note>
          }
          @for (w of widgets(); track w.widget.title) {
            @if (w.widget.type === 'kpi') {
              <div class="app-stat">
                <div class="app-stat-label">{{ w.widget.title }}</div>
                <div class="app-stat-value">{{ format(w) }}</div>
              </div>
            } @else {
              <div class="app-card">
                <div class="app-card-title"><h4>{{ w.widget.title }}</h4></div>
                @if (!w.rows || w.rows.length === 0) {
                  <ion-note>Không có dữ liệu.</ion-note>
                } @else {
                  <ion-list lines="full">
                    @for (r of w.rows; track r.key) {
                      <ion-item>
                        <ion-icon slot="start" name="pricetag-outline" color="medium" />
                        <ion-label>
                          <h3>{{ r.key }}</h3>
                          <div class="bar" [style.width.%]="barWidth(w, r)"></div>
                        </ion-label>
                        <ion-badge slot="end" color="primary">{{ r.count }}</ion-badge>
                      </ion-item>
                    }
                  </ion-list>
                }
              </div>
            }
          }
          <ion-note class="page-hint">
            Số liệu hiển thị theo dữ liệu hiện tại của shop. Không tính phí AI khi xem.
          </ion-note>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14px; font-weight: 600; color: var(--app-text); }
    .app-stat { margin-bottom: 12px; }
    .bar { height: 4px; border-radius: 3px; background: linear-gradient(90deg, var(--ion-color-primary), var(--ion-color-secondary)); margin-top: 6px; max-width: 100%; }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 10px 4px; }
  `],
})
export class AiPageDetailPage implements OnInit {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  private service = inject(AiPagesService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly page = signal<AiPage | null>(null);
  readonly widgets = signal<RenderedWidget[]>([]);
  readonly loading = signal(true);

  constructor() {
    addIcons({
      gridOutline, trashOutline, warningOutline, refreshOutline, analyticsOutline,
      barChartOutline, pricetagOutline,
    });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const id = this.route.snapshot.paramMap.get('id') ?? '';
      const page = await this.service.get(id);
      this.page.set(page);
      if (page) {
        this.widgets.set(await this.service.run(page));
      }
    } catch (e: any) {
      console.error('load ai page detail failed', e);
      this.page.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  async run() {
    const p = this.page();
    if (!p) return;
    try {
      this.widgets.set(await this.service.run(p));
      this.toast('Đã làm mới dữ liệu');
    } catch (e: any) {
      this.toast(e?.message ?? 'Làm mới thất bại', 'danger');
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  format(w: RenderedWidget): string {
    return formatMetric(w.value, w.widget.source, w.widget.metric);
  }

  barWidth(w: RenderedWidget, r: { count: number }): number {
    const max = Math.max(1, ...(w.rows ?? []).map((x) => x.count));
    return Math.round((r.count / max) * 100);
  }

  async remove() {
    const p = this.page();
    if (!p) return;
    const alert = await this.alertCtrl.create({
      header: 'Xóa trang',
      message: `Xóa trang "${p.name}"?`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: async () => {
            try {
              await this.service.remove(p.id);
              this.toast('Đã xóa trang');
              this.router.navigateByUrl('/ai-dynamic-page');
            } catch (e: any) {
              this.toast(e?.message ?? 'Xóa thất bại', 'danger');
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

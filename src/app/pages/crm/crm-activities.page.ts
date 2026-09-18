import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonFab, IonFabButton,
  IonRefresher, IonRefresherContent, AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, pulseOutline, callOutline, peopleOutline, mailOutline, chatbubbleOutline, documentOutline } from 'ionicons/icons';
import { ShopTableService } from '../../core/services/shop-table.service';
import { CrmService } from '../../core/services/crm.service';

interface CrmActivity {
  id: string;
  lead_id: string | null;
  type: 'call' | 'meeting' | 'note' | 'email' | 'zalo';
  content: string;
  created_at: string;
}

@Component({
  selector: 'app-crm-activities',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonFab,
    IonFabButton, IonRefresher, IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/crm" /></ion-buttons>
        <ion-title>CRM — Hoạt động</ion-title>
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
            <div><ion-icon name="pulse-outline" /></div>
            Chưa có hoạt động nào. Nhấn + để ghi nhận cuộc gọi / gặp gỡ khách.
          </div>
        } @else {
          <div class="app-card">
            <ion-list lines="full">
              @for (a of items(); track a.id) {
                <ion-item>
                  <div class="act-icon" slot="start"><ion-icon [name]="iconFor(a.type)" /></div>
                  <ion-label>
                    <h3>{{ leadName(a.lead_id) }}</h3>
                    <p>{{ a.content }}</p>
                    <p>{{ a.created_at | date: 'dd/MM HH:mm' }}</p>
                  </ion-label>
                  <ion-badge slot="end" color="medium">{{ typeLabel(a.type) }}</ion-badge>
                </ion-item>
              }
            </ion-list>
          </div>
          <ion-note class="page-hint">Nhấn + để ghi nhận hoạt động mới</ion-note>
        }
      </div>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="addActivity()"><ion-icon name="add-outline" /></ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .act-icon { width: 38px; height: 38px; border-radius: 10px; background: rgba(var(--ion-color-primary-rgb), 0.12); color: var(--ion-color-primary); display: flex; align-items: center; justify-content: center; }
    .act-icon ion-icon { font-size: 19px; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; white-space: normal; }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 4px; }
  `],
})
export class CrmActivitiesPage implements OnInit {
  readonly svc = inject(ShopTableService);
  readonly crmService = inject(CrmService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly items = signal<CrmActivity[]>([]);
  readonly loading = signal(true);
  private leads = signal<Array<{ id: string; name: string }>>([]);

  constructor() {
    addIcons({ addOutline, pulseOutline, callOutline, peopleOutline, mailOutline, chatbubbleOutline, documentOutline });
  }

  ngOnInit(): void { this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const [acts, leads] = await Promise.all([
        this.svc.list<CrmActivity>('crm_activities', 'created_at', false),
        this.crmService.list(),
      ]);
      this.leads.set(leads.map((l) => ({ id: l.id, name: l.name })));
      this.items.set(acts);
    } catch (e: any) {
      console.error('load activities failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  iconFor(type: string): string {
    const map: Record<string, string> = {
      call: 'call-outline',
      meeting: 'people-outline',
      email: 'mail-outline',
      zalo: 'chatbubble-outline',
      note: 'document-outline',
    };
    return map[type] ?? 'document-outline';
  }

  typeLabel(type: string): string {
    const map: Record<string, string> = { call: 'Gọi', meeting: 'Gặp', email: 'Email', zalo: 'Zalo', note: 'Ghi chú' };
    return map[type] ?? type;
  }

  leadName(leadId: string | null): string {
    if (!leadId) return 'Khách chung';
    return this.leads().find((l) => l.id === leadId)?.name ?? 'Lead';
  }

  async addActivity() {
    const alert = await this.alertCtrl.create({
      header: 'Ghi nhận hoạt động',
      inputs: [
        { name: 'content', type: 'textarea', placeholder: 'Nội dung: gọi tư vấn, gặp khách...' },
        { name: 'type', type: 'radio', label: 'Cuộc gọi', value: 'call', checked: true },
        { name: 'type', type: 'radio', label: 'Gặp mặt', value: 'meeting' },
        { name: 'type', type: 'radio', label: 'Email', value: 'email' },
        { name: 'type', type: 'radio', label: 'Zalo', value: 'zalo' },
        { name: 'type', type: 'radio', label: 'Ghi chú', value: 'note' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Lưu',
          handler: async (data) => {
            if (!data?.content?.trim()) {
              this.toast('Vui lòng nhập nội dung', 'danger');
              return false;
            }
            try {
              await this.svc.create('crm_activities', { type: data.type ?? 'note', content: data.content.trim() });
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

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}

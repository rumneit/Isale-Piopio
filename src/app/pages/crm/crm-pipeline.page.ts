import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonBadge, IonSpinner, IonNote, ActionSheetController, ToastController, IonButton,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { gitBranchOutline, callOutline } from 'ionicons/icons';
import { CrmService, CrmLead } from '../../core/services/crm.service';

@Component({
  selector: 'app-crm-pipeline',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonBadge, IonSpinner, IonNote, IonButton,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/crm" /></ion-buttons>
        <ion-title>Pipeline</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="openList()"><ion-icon slot="icon-only" name="list-outline" /></ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      @if (loading()) {
        <div class="page-loading"><ion-spinner name="crescent" /></div>
      } @else {
        <div class="kanban" (dragover)="$event.preventDefault()">
          @for (stage of crmService.stages; track stage.value) {
            <div
              class="kanban-col"
              [class.drag-over]="dragOverStage() === stage.value"
              (dragover)="onDragOver($event, stage.value)"
              (dragleave)="dragLeave()"
              (drop)="onDrop($event, stage.value)"
            >
              <div class="kanban-col-head">
                <span class="kanban-dot" [style.background]="stageColor(stage.value)"></span>
                <span class="kanban-col-title">{{ stage.label }}</span>
                <ion-badge color="light">{{ leadsBy(stage.value).length }}</ion-badge>
              </div>

              @for (lead of leadsBy(stage.value); track lead.id) {
                <div
                  class="kanban-card"
                  draggable="true"
                  (dragstart)="onDragStart($event, lead)"
                  (dragend)="dragLeave()"
                  (click)="openStageMenu(lead)"
                >
                  <div class="kanban-card-name">{{ lead.name }}</div>
                  @if ((lead.value ?? 0) > 0) {
                    <div class="kanban-card-value">{{ formatMoney(lead.value) }}</div>
                  }
                  @if (lead.phone) {
                    <div class="kanban-card-phone"><ion-icon name="call-outline" /> {{ lead.phone }}</div>
                  }
                </div>
              }

              @if (leadsBy(stage.value).length === 0) {
                <div class="kanban-empty">Thả khách vào đây</div>
              }
            </div>
          }
        </div>
        <ion-note class="page-hint">Kéo-thả thẻ giữa các cột để chuyển stage · nhấn thẻ để chọn nhanh</ion-note>
      }
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .kanban {
      display: flex;
      gap: 10px;
      overflow-x: auto;
      padding: 14px 12px 20px;
      height: calc(100% - 40px);
      align-items: flex-start;
    }
    .kanban-col {
      flex: 0 0 250px;
      background: color-mix(in srgb, var(--app-surface) 70%, var(--app-page-bg));
      border: 1px dashed var(--app-border);
      border-radius: 14px;
      padding: 10px;
      min-height: 200px;
      max-height: 100%;
      overflow-y: auto;
      transition: border-color 0.15s ease, background 0.15s ease;
    }
    .kanban-col.drag-over {
      border: 2px solid var(--ion-color-primary);
      background: rgba(var(--ion-color-primary-rgb), 0.06);
    }
    .kanban-col-head {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 10px;
      position: sticky;
      top: 0;
    }
    .kanban-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
    .kanban-col-title { font-weight: 800; font-size: 13px; color: var(--app-text); flex: 1; }
    .kanban-card {
      background: var(--app-surface);
      border: 1px solid var(--app-border);
      border-radius: 12px;
      padding: 10px 12px;
      margin-bottom: 8px;
      cursor: grab;
      box-shadow: var(--app-shadow-sm);
      transition: transform 0.12s ease, box-shadow 0.12s ease;
    }
    .kanban-card:active { cursor: grabbing; }
    .kanban-card:hover { transform: translateY(-2px); box-shadow: var(--app-shadow-md); }
    .kanban-card-name { font-weight: 700; font-size: 13.5px; color: var(--app-text); }
    .kanban-card-value { font-size: 12.5px; font-weight: 700; color: var(--ion-color-tertiary); margin-top: 2px; }
    .kanban-card-phone { font-size: 11.5px; color: var(--app-text-muted); margin-top: 3px; display: flex; align-items: center; gap: 4px; }
    .kanban-empty { text-align: center; font-size: 11.5px; color: var(--app-text-muted); padding: 18px 6px; border: 1px dashed var(--app-border); border-radius: 10px; }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 0 12px 10px; }
  `],
})
export class CrmPipelinePage implements OnInit {
  readonly crmService = inject(CrmService);
  private actionSheetCtrl = inject(ActionSheetController);
  private toastCtrl = inject(ToastController);

  readonly leads = signal<CrmLead[]>([]);
  readonly loading = signal(true);
  readonly dragOverStage = signal<string | null>(null);
  private dragLead: CrmLead | null = null;

  constructor() {
    addIcons({ gitBranchOutline, callOutline });
  }

  ngOnInit(): void { this.load(); }

  async load() {
    this.loading.set(true);
    try {
      this.leads.set(await this.crmService.list());
    } catch (e: any) {
      console.error('load pipeline failed', e);
      this.leads.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  leadsBy(stage: string): CrmLead[] {
    return this.leads().filter((l) => l.stage === stage);
  }

  stageColor(stage: string): string {
    const map: Record<string, string> = {
      new: 'var(--ion-color-primary)',
      contacting: 'var(--ion-color-secondary)',
      quoted: 'var(--ion-color-tertiary)',
      won: 'var(--ion-color-success)',
      lost: 'var(--ion-color-medium)',
    };
    return map[stage] ?? 'var(--ion-color-primary)';
  }

  onDragStart(ev: DragEvent, lead: CrmLead) {
    this.dragLead = lead;
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', lead.id);
    }
  }

  onDragOver(ev: DragEvent, stage: string) {
    ev.preventDefault();
    this.dragOverStage.set(stage);
  }

  dragLeave() {
    this.dragOverStage.set(null);
  }

  async onDrop(ev: DragEvent, stage: string) {
    ev.preventDefault();
    this.dragOverStage.set(null);
    const lead = this.dragLead;
    this.dragLead = null;
    if (!lead || lead.stage === stage) return;
    try {
      await this.crmService.update(lead.id, { stage: stage as CrmLead['stage'] });
      this.leads.update((list) => list.map((l) => (l.id === lead.id ? { ...l, stage: stage as CrmLead['stage'] } : l)));
      this.toast(`Đã chuyển ${lead.name} → ${this.crmService.stageLabel(stage)}`);
    } catch (e: any) {
      this.toast(e?.message ?? 'Chuyển stage thất bại', 'danger');
    }
  }

  async openStageMenu(lead: CrmLead) {
    const sheet = await this.actionSheetCtrl.create({
      header: `${lead.name} — ${this.crmService.stageLabel(lead.stage)}`,
      buttons: [
        ...this.crmService.stages
          .filter((s) => s.value !== lead.stage)
          .map((s) => ({
            text: `Chuyển: ${s.label}`,
            handler: async () => {
              try {
                await this.crmService.update(lead.id, { stage: s.value });
                await this.load();
              } catch (e: any) {
                this.toast(e?.message ?? 'Thất bại', 'danger');
              }
            },
          })),
        { text: 'Hủy', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  openList() {
    window.location.hash = '#/crm';
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1600, color, position: 'bottom' });
    await t.present();
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}

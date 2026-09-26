import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonButton,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonIcon,
  IonContent,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonList,
  IonItem,
  IonBadge,
  IonFab,
  IonFabButton,
  IonSpinner,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  ActionSheetController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline,
  personOutline,
  callOutline,
  analyticsOutline,
  createOutline,
  trashOutline,
  closeOutline,
  checkmarkCircleOutline,
  arrowForwardOutline,
} from 'ionicons/icons';
import { CrmService, CrmLead } from '../../core/services/crm.service';

@Component({
  selector: 'app-crm-list',
  templateUrl: './crm-list.page.html',
  styleUrls: ['./crm-list.page.scss'],
  imports: [
    IonButton,
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonIcon,
    IonContent,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonList,
    IonItem,
    IonBadge,
    IonFab,
    IonFabButton,
    IonSpinner,
    IonNote,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class CrmListPage implements OnInit {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  readonly crmService = inject(CrmService);
  private actionSheetCtrl = inject(ActionSheetController);
  private router = inject(Router);

  readonly items = signal<CrmLead[]>([]);
  readonly loading = signal(true);
  readonly stageFilter = signal<'all' | CrmLead['stage']>('all');
  search = '';

  constructor() {
    addIcons({
      addOutline,
      personOutline,
      callOutline,
      analyticsOutline,
      createOutline,
      trashOutline,
      closeOutline,
      checkmarkCircleOutline,
      arrowForwardOutline,
    });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.crmService.list(this.stageFilter(), this.search));
    } catch (e: any) {
      console.error('load leads failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async onSearch(ev: CustomEvent) {
    this.search = (ev.detail as any).value ?? '';
    await this.load();
  }

  async onStage(ev: CustomEvent) {
    this.stageFilter.set(ev.detail.value as any);
    await this.load();
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  openAdd() {
    this.router.navigateByUrl('/crm/add');
  }

  openEdit(lead: CrmLead) {
    this.router.navigateByUrl(`/crm/${lead.id}`);
  }

  get stageCounts(): Record<string, number> {
    return {};
  }

  async changeStage(lead: CrmLead) {
    const sheet = await this.actionSheetCtrl.create({
      header: `Chuyển stage — ${lead.name}`,
      buttons: [
        ...this.crmService.stages
          .filter((s) => s.value !== lead.stage)
          .map((s) => ({
            text: s.label,
            handler: async () => {
              try {
                await this.crmService.update(lead.id, { stage: s.value });
                await this.load();
              } catch (e: any) {
                console.error('update stage failed', e);
              }
            },
          })),
        { text: 'Hủy', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}

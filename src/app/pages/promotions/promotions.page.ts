import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonIcon,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonFab,
  IonFabButton,
  IonSpinner,
  IonNote,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, cardOutline, pricetagOutline, cashOutline } from 'ionicons/icons';
import { PromotionsService, Promotion } from '../../core/services/promotions.service';

@Component({
  selector: 'app-promotions',
  templateUrl: './promotions.page.html',
  styleUrls: ['./promotions.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonFab,
    IonFabButton,
    IonSpinner,
    IonNote,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class PromotionsPage implements OnInit {
  readonly promotionsService = inject(PromotionsService);
  private router = inject(Router);

  readonly items = signal<Promotion[]>([]);
  readonly loading = signal(true);

  constructor() {
    addIcons({ addOutline, cardOutline, pricetagOutline, cashOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.promotionsService.list());
    } catch (e: any) {
      console.error('load promotions failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  openDetail(item: Promotion) {
    this.router.navigateByUrl(`/promotion/${item.id}`);
  }

  openAdd() {
    this.router.navigateByUrl('/promotion/add');
  }
}

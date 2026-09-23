import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonButton,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonIcon,
  IonContent,
  IonSearchbar,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonSpinner,
  IonNote,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { returnDownBackOutline } from 'ionicons/icons';
import { ReturnsService, ReturnNote } from '../../core/services/returns.service';

@Component({
  selector: 'app-returns',
  templateUrl: './returns.page.html',
  styleUrls: ['./returns.page.scss'],
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
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonSpinner,
    IonNote,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class ReturnsPage implements OnInit {
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  readonly returnsService = inject(ReturnsService);

  readonly items = signal<ReturnNote[]>([]);
  readonly loading = signal(true);
  search = '';

  constructor() {
    addIcons({ returnDownBackOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.returnsService.list(this.search));
    } catch (e: any) {
      console.error('load returns failed', e);
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

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}

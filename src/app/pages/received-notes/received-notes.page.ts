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
  IonSearchbar,
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
  AlertController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, downloadOutline, alertCircleOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { ReceivedNotesService, ReceivedNote } from '../../core/services/received-notes.service';
import { DataService } from '../../core/services/data.service';

@Component({
  selector: 'app-received-notes',
  templateUrl: './received-notes.page.html',
  styleUrls: ['./received-notes.page.scss'],
  imports: [
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
    IonFab,
    IonFabButton,
    IonSpinner,
    IonNote,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class ReceivedNotesPage implements OnInit {
  private notesService = inject(ReceivedNotesService);
  private dataService = inject(DataService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);

  readonly items = signal<ReceivedNote[]>([]);
  readonly loading = signal(true);
  search = '';

  constructor() {
    addIcons({ addOutline, downloadOutline, alertCircleOutline, checkmarkCircleOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.notesService.list(this.search));
    } catch (e: any) {
      console.error('load received notes failed', e);
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

  openAdd() {
    this.router.navigateByUrl('/module/received-note-add');
  }

  async confirmDelete(note: ReceivedNote) {
    const alert = await this.alertCtrl.create({
      header: 'Xóa phiếu nhập',
      message: `Xóa ${note.code}? Tồn kho của ${note.items.length} sản phẩm sẽ được hoàn lại.`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: async () => {
            try {
              await this.notesService.remove(note);
              this.toast('Đã xóa phiếu nhập');
              await this.load();
              this.dataService.refreshHome();
            } catch (e: any) {
              this.toast(e?.message ?? 'Xóa thất bại', 'danger');
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

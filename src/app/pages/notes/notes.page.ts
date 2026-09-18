import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonSearchbar, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonFab,
  IonFabButton, IonRefresher, IonRefresherContent, AlertController, ToastController, IonButton,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, bookOutline, createOutline, trashOutline, pinOutline } from 'ionicons/icons';
import { ShopTableService } from '../../core/services/shop-table.service';

interface Note {
  id: string;
  title: string;
  content: string | null;
  pinned: boolean;
  created_at: string;
}

@Component({
  selector: 'app-notes',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonSearchbar, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote,
    IonFab, IonFabButton, IonRefresher, IonRefresherContent, IonButton,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /></ion-buttons>
        <ion-title>Ghi chú</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar placeholder="Tìm ghi chú" [debounce]="300" (ionInput)="onSearch($any($event))" />
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
            <div><ion-icon name="book-outline" /></div>
            Chưa có ghi chú nào. Nhấn + để thêm.
          </div>
        } @else {
          <div class="app-card">
            <ion-list lines="full">
              @for (note of items(); track note.id) {
                <ion-item>
                  <ion-icon slot="start" name="pin-outline" [color]="note.pinned ? 'warning' : 'medium'" />
                  <ion-label>
                    <h3>{{ note.title }}</h3>
                    @if (note.content) { <p class="note-content">{{ note.content }}</p> }
                    <p>{{ note.created_at | date: 'dd/MM/yyyy HH:mm' }}</p>
                  </ion-label>
                  <ion-button slot="end" fill="clear" size="small" (click)="togglePin(note)">
                    <ion-icon slot="icon-only" name="pin-outline" />
                  </ion-button>
                  <ion-button slot="end" fill="clear" size="small" (click)="editNote(note)">
                    <ion-icon slot="icon-only" name="create-outline" />
                  </ion-button>
                  <ion-button slot="end" fill="clear" size="small" color="danger" (click)="deleteNote(note)">
                    <ion-icon slot="icon-only" name="trash-outline" />
                  </ion-button>
                </ion-item>
              }
            </ion-list>
          </div>
        }
      </div>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="addNote()"><ion-icon name="add-outline" /></ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 15px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; white-space: normal; }
    .note-content { display: block; margin-bottom: 2px; }
  `],
})
export class NotesPage implements OnInit {
  private svc = inject(ShopTableService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly items = signal<Note[]>([]);
  readonly loading = signal(true);
  search = '';

  constructor() {
    addIcons({ addOutline, bookOutline, createOutline, trashOutline, pinOutline });
  }

  ngOnInit(): void { this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const all = await this.svc.list<Note>('notes', 'created_at', false, { column: 'title', term: this.search });
      // Ghim lên đầu
      all.sort((a, b) => Number(b.pinned) - Number(a.pinned));
      this.items.set(all);
    } catch (e: any) {
      console.error('load notes failed', e);
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

  async addNote() {
    await this.openForm(null);
  }

  async editNote(note: Note) {
    await this.openForm(note);
  }

  private async openForm(existing: Note | null) {
    const alert = await this.alertCtrl.create({
      header: existing ? 'Sửa ghi chú' : 'Thêm ghi chú',
      inputs: [
        { name: 'title', type: 'text', placeholder: 'Tiêu đề *', value: existing?.title ?? '' },
        { name: 'content', type: 'textarea', placeholder: 'Nội dung...', value: existing?.content ?? '' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Lưu',
          handler: async (data) => {
            if (!data?.title?.trim()) {
              this.toast('Vui lòng nhập tiêu đề', 'danger');
              return false;
            }
            try {
              if (existing) {
                await this.svc.update('notes', existing.id, {
                  title: data.title.trim(),
                  content: data.content?.trim() || null,
                });
              } else {
                await this.svc.create('notes', {
                  title: data.title.trim(),
                  content: data.content?.trim() || null,
                });
              }
              await this.load();
              return true;
            } catch (err: any) {
              this.toast(err?.message ?? 'Lưu thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async togglePin(note: Note) {
    try {
      await this.svc.update('notes', note.id, { pinned: !note.pinned });
      await this.load();
    } catch (e: any) {
      this.toast(e?.message ?? 'Thất bại', 'danger');
    }
  }

  async deleteNote(note: Note) {
    const alert = await this.alertCtrl.create({
      header: 'Xóa ghi chú',
      message: `Xóa "${note.title}"?`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa', role: 'destructive',
          handler: async () => {
            try {
              await this.svc.remove('notes', note.id);
              await this.load();
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

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonSpinner,
  IonList,
  IonItem,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonToggle,
  IonTextarea,
  IonLabel,
  IonNote,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { saveOutline, trashOutline, closeOutline, cardOutline } from 'ionicons/icons';
import { PromotionsService, Promotion } from '../../core/services/promotions.service';

@Component({
  selector: 'app-promotion-edit',
  templateUrl: './promotion-edit.page.html',
  styleUrls: ['./promotion-edit.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSpinner,
    IonList,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonToggle,
    IonTextarea,
    IonLabel,
    IonNote,
    FormsModule,
  ],
})
export class PromotionEditPage implements OnInit {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private promotionsService = inject(PromotionsService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly promotionId = signal<string | null>(null);
  readonly busy = signal(false);
  readonly deleting = signal(false);
  error = '';

  name = '';
  type: 'percent' | 'fixed' = 'percent';
  value: number | null = 0;
  active = true;
  note = '';

  constructor() {
    addIcons({ saveOutline, trashOutline, closeOutline, cardOutline });
  }

  get isEdit(): boolean {
    return !!this.promotionId();
  }

  get valueLabel(): string {
    return this.type === 'percent' ? 'Phần trăm giảm (%)' : 'Số tiền giảm (₫)';
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'add') {
      this.promotionId.set(id);
      this.busy.set(true);
      try {
        const promo = await this.promotionsService.get(id);
        if (promo) {
          this.name = promo.name;
          this.type = promo.type;
          this.value = promo.value;
          this.active = promo.active;
          this.note = promo.note ?? '';
        }
      } catch (e: any) {
        this.error = e?.message ?? 'Không tải được khuyến mãi.';
      } finally {
        this.busy.set(false);
      }
    }
  }

  async save() {
    this.error = '';
    if (!this.name.trim()) {
      this.error = 'Vui lòng nhập tên khuyến mãi.';
      return;
    }
    if (!this.value || Number(this.value) <= 0) {
      this.error = 'Giá trị khuyến mãi phải lớn hơn 0.';
      return;
    }
    if (this.type === 'percent' && Number(this.value) > 100) {
      this.error = 'Phần trăm giảm không được quá 100%.';
      return;
    }

    const payload: Partial<Promotion> = {
      name: this.name.trim(),
      type: this.type,
      value: Number(this.value),
      active: this.active,
      note: this.note.trim() || null,
    };

    this.busy.set(true);
    try {
      if (this.isEdit) {
        await this.promotionsService.update(this.promotionId()!, payload);
      } else {
        await this.promotionsService.create(payload);
      }
      this.toast('Đã lưu khuyến mãi');
      this.router.navigateByUrl('/promotion', { replaceUrl: true });
    } catch (e: any) {
      this.error = e?.message ?? 'Lưu thất bại.';
    } finally {
      this.busy.set(false);
    }
  }

  async confirmDelete() {
    if (!this.isEdit) return;
    const alert = await this.alertCtrl.create({
      header: 'Xóa khuyến mãi',
      message: `Xóa "${this.name}"?`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        { text: 'Xóa', role: 'destructive', handler: () => this.doDelete() },
      ],
    });
    await alert.present();
  }

  private async doDelete() {
    this.deleting.set(true);
    try {
      await this.promotionsService.remove(this.promotionId()!);
      this.toast('Đã xóa khuyến mãi');
      this.router.navigateByUrl('/promotion', { replaceUrl: true });
    } catch (e: any) {
      this.toast(e?.message ?? 'Xóa thất bại', 'danger');
    } finally {
      this.deleting.set(false);
    }
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }

  goBack() {
    this.router.navigateByUrl('/promotion', { replaceUrl: true });
  }
}

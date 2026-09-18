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
  IonTextarea,
  IonLabel,
  IonNote,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { saveOutline, trashOutline, closeOutline, personOutline, callOutline, analyticsOutline } from 'ionicons/icons';
import { CrmService, CrmLead } from '../../core/services/crm.service';

@Component({
  selector: 'app-crm-edit',
  templateUrl: './crm-edit.page.html',
  styleUrls: ['./crm-edit.page.scss'],
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
    IonTextarea,
    IonLabel,
    IonNote,
    FormsModule,
  ],
})
export class CrmEditPage implements OnInit {
  readonly route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly crmService = inject(CrmService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly leadId = signal<string | null>(null);
  readonly busy = signal(false);
  readonly deleting = signal(false);
  error = '';

  name = '';
  phone = '';
  email = '';
  source = '';
  stage: CrmLead['stage'] = 'new';
  value: number | null = 0;
  note = '';

  constructor() {
    addIcons({ saveOutline, trashOutline, closeOutline, personOutline, callOutline, analyticsOutline });
  }

  get isEdit(): boolean {
    return !!this.leadId();
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'add') {
      this.leadId.set(id);
      this.busy.set(true);
      try {
        const lead = await this.crmService.get(id);
        if (lead) {
          this.name = lead.name;
          this.phone = lead.phone ?? '';
          this.email = lead.email ?? '';
          this.source = lead.source ?? '';
          this.stage = lead.stage;
          this.value = lead.value;
          this.note = lead.note ?? '';
        }
      } catch (e: any) {
        this.error = e?.message ?? 'Không tải được lead.';
      } finally {
        this.busy.set(false);
      }
    }
  }

  async save() {
    this.error = '';
    if (!this.name.trim()) {
      this.error = 'Vui lòng nhập tên khách hàng tiềm năng.';
      return;
    }

    const payload: Partial<CrmLead> = {
      name: this.name.trim(),
      phone: this.phone.trim() || null,
      email: this.email.trim() || null,
      source: this.source || null,
      stage: this.stage,
      value: Number(this.value ?? 0),
      note: this.note.trim() || null,
    };

    this.busy.set(true);
    try {
      if (this.isEdit) {
        await this.crmService.update(this.leadId()!, payload);
      } else {
        await this.crmService.create(payload);
      }
      this.toast('Đã lưu lead');
      this.router.navigateByUrl('/crm', { replaceUrl: true });
    } catch (e: any) {
      this.error = e?.message ?? 'Lưu thất bại.';
    } finally {
      this.busy.set(false);
    }
  }

  async confirmDelete() {
    if (!this.isEdit) return;
    const alert = await this.alertCtrl.create({
      header: 'Xóa lead',
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
      await this.crmService.remove(this.leadId()!);
      this.toast('Đã xóa lead');
      this.router.navigateByUrl('/crm', { replaceUrl: true });
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
    this.router.navigateByUrl('/crm', { replaceUrl: true });
  }
}

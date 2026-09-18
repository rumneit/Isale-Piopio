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
  IonTextarea,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { saveOutline, trashOutline, closeOutline } from 'ionicons/icons';
import { CustomersService } from '../../core/services/customers.service';
import { Customer } from '../../core/models/models';

@Component({
  selector: 'app-customer-edit',
  templateUrl: './customer-edit.page.html',
  styleUrls: ['./customer-edit.page.scss'],
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
    IonTextarea,
    FormsModule,
  ],
})
export class CustomerEditPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private customersService = inject(CustomersService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly customerId = signal<string | null>(null);
  readonly busy = signal(false);
  readonly deleting = signal(false);
  error = '';

  name = '';
  phone = '';
  email = '';
  address = '';
  debt: number | null = 0;

  constructor() {
    addIcons({ saveOutline, trashOutline, closeOutline });
  }

  get isEdit(): boolean {
    return !!this.customerId();
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'add') {
      this.customerId.set(id);
      this.busy.set(true);
      try {
        const c = await this.customersService.get(id);
        if (c) {
          this.name = c.name;
          this.phone = c.phone ?? '';
          this.email = c.email ?? '';
          this.address = c.address ?? '';
          this.debt = c.debt;
        }
      } catch (e: any) {
        this.error = e?.message ?? 'Không tải được khách hàng.';
      } finally {
        this.busy.set(false);
      }
    }
  }

  async save() {
    this.error = '';
    if (!this.name.trim()) {
      this.error = 'Vui lòng nhập tên khách hàng.';
      return;
    }

    const payload: Partial<Customer> = {
      name: this.name.trim(),
      phone: this.phone.trim() || null,
      email: this.email.trim() || null,
      address: this.address.trim() || null,
      debt: Number(this.debt ?? 0),
    };

    this.busy.set(true);
    try {
      if (this.isEdit) {
        await this.customersService.update(this.customerId()!, payload);
      } else {
        await this.customersService.create(payload);
      }
      this.toast('Đã lưu khách hàng');
      this.router.navigateByUrl('/contact', { replaceUrl: true });
    } catch (e: any) {
      this.error = e?.message ?? 'Lưu thất bại.';
    } finally {
      this.busy.set(false);
    }
  }

  async confirmDelete() {
    if (!this.isEdit) return;
    const alert = await this.alertCtrl.create({
      header: 'Xóa khách hàng',
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
      await this.customersService.remove(this.customerId()!);
      this.toast('Đã xóa khách hàng');
      this.router.navigateByUrl('/contact', { replaceUrl: true });
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
    this.router.navigateByUrl('/contact', { replaceUrl: true });
  }
}

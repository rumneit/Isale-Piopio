import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
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
  IonCheckbox,
  IonLabel,
  IonNote,
  IonBadge,
  IonToggle,
  ToastController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { saveOutline, closeOutline, downloadOutline, cubeOutline, addOutline, trashOutline } from 'ionicons/icons';
import { ReceivedNotesService, ReceivedNoteItem } from '../../core/services/received-notes.service';
import { ProductsService } from '../../core/services/products.service';
import { Product } from '../../core/models/models';

@Component({
  selector: 'app-received-note-add',
  templateUrl: './received-note-add.page.html',
  styleUrls: ['./received-note-add.page.scss'],
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
    IonCheckbox,
    IonLabel,
    IonNote,
    IonBadge,
    IonToggle,
    FormsModule,
  ],
})
export class ReceivedNoteAddPage implements OnInit {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  private router = inject(Router);
  private notesService = inject(ReceivedNotesService);
  private productsService = inject(ProductsService);
  private toastCtrl = inject(ToastController);

  readonly busy = signal(false);
  readonly products = signal<Product[]>([]);
  readonly items = signal<ReceivedNoteItem[]>([]);

  supplier = '';
  paid = true;
  note = '';
  error = '';

  constructor() {
    addIcons({ saveOutline, closeOutline, downloadOutline, cubeOutline, addOutline, trashOutline });
  }

  async ngOnInit(): Promise<void> {
    try {
      this.products.set(await this.productsService.list());
    } catch (e: any) {
      console.error('load products failed', e);
    }
  }

  get total(): number {
    return this.items().reduce((s, i) => s + i.qty * i.cost, 0);
  }

  addProduct(ev: CustomEvent) {
    const productId = ev.detail.value as string;
    if (!productId) return;
    const product = this.products().find((p) => p.id === productId);
    if (!product) return;

    const current = [...this.items()];
    const existing = current.find((i) => i.product_id === productId);
    if (existing) {
      existing.qty += 1;
    } else {
      current.push({
        product_id: productId,
        name: product.name,
        qty: 1,
        cost: Number(product.cost ?? product.price ?? 0),
      });
    }
    this.items.set(current);
    (ev.target as HTMLIonSelectElement).value = '';
  }

  removeItem(index: number) {
    const current = [...this.items()];
    current.splice(index, 1);
    this.items.set(current);
  }

  async save() {
    this.error = '';
    if (!this.items().length) {
      this.error = 'Phiếu nhập cần ít nhất một sản phẩm.';
      return;
    }
    if (this.items().some((i) => i.qty <= 0)) {
      this.error = 'Số lượng nhập phải lớn hơn 0.';
      return;
    }

    this.busy.set(true);
    try {
      const created = await this.notesService.create(
        {
          supplier_name: this.supplier.trim() || null,
          paid: this.paid,
          note: this.note.trim() || null,
        },
        this.items()
      );
      const t = await this.toastCtrl.create({
        message: `Đã nhập hàng ${created.code} — tồn kho đã được cập nhật`,
        duration: 2000,
        color: 'success',
        position: 'bottom',
      });
      await t.present();
      this.router.navigateByUrl('/received-note', { replaceUrl: true });
    } catch (e: any) {
      this.error = e?.message ?? 'Tạo phiếu nhập thất bại.';
    } finally {
      this.busy.set(false);
    }
  }

  goBack() {
    this.router.navigateByUrl('/received-note', { replaceUrl: true });
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}

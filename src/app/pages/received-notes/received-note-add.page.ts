import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
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
  AlertController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { saveOutline, closeOutline, downloadOutline, cubeOutline, addOutline, trashOutline, businessOutline, hourglassOutline } from 'ionicons/icons';
import { ReceivedNotesService, ReceivedNoteItem } from '../../core/services/received-notes.service';
import { ProductsService } from '../../core/services/products.service';
import { SuppliersService, Supplier } from '../../core/services/suppliers.service';
import { InventoryLedgerService, OpenReceiveNote } from '../../core/services/inventory-ledger.service';
import { AuthService } from '../../core/services/auth.service';
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
  private route = inject(ActivatedRoute);
  private notesService = inject(ReceivedNotesService);
  private productsService = inject(ProductsService);
  private suppliersService = inject(SuppliersService);
  private ledger = inject(InventoryLedgerService);
  private auth = inject(AuthService);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);

  readonly busy = signal(false);
  readonly products = signal<Product[]>([]);
  readonly items = signal<ReceivedNoteItem[]>([]);
  readonly suppliers = signal<Supplier[]>([]);

  supplierId = '';   // '' = chưa chọn, 'manual' = nhập tay không lưu NCC
  supplierManual = '';
  paid = true;
  paidAmount = 0;    // trả trước khi chưa trả đủ
  dueDate = '';      // 'YYYY-MM-DD'
  note = '';
  error = '';

  /** Bật "đặt trước, nhận một phần": hiện cột Số đặt (qty_ordered) — v29. */
  preorder = false;
  /** Phiếu gốc khi "Nhập tiếp phần thiếu" (query ?continue=<rootId>). */
  continueRoot: OpenReceiveNote | null = null;

  /** Người dùng hiện tại có quyền duyệt phiếu nhập? */
  get canApprove(): boolean {
    return this.auth.can('inventory_approve');
  }

  get showQtyOrdered(): boolean {
    return this.preorder || this.continueRoot !== null;
  }

  constructor() {
    addIcons({ saveOutline, closeOutline, downloadOutline, cubeOutline, addOutline, trashOutline, businessOutline, hourglassOutline });
  }

  async ngOnInit(): Promise<void> {
    try {
      this.products.set(await this.productsService.list());
    } catch (e: any) {
      console.error('load products failed', e);
    }
    try {
      this.suppliers.set(await this.suppliersService.list());
    } catch (e: any) {
      console.warn('load suppliers failed (v28 chưa chạy?)', e);
    }
    const continueId = this.route.snapshot?.queryParamMap?.get('continue');
    if (continueId) await this.loadContinueRoot(continueId);
  }

  /** Prefill form từ phần còn thiếu của phiếu gốc (v29 — "Nhập tiếp"). */
  private async loadContinueRoot(rootId: string) {
    try {
      const opens = await this.ledger.openReceiveNotes();
      const root = opens?.find((o) => o.root_id === rootId) ?? null;
      if (!root) {
        this.error = 'Không tìm thấy phần còn thiếu của phiếu này (có thể đã nhận đủ hàng).';
        return;
      }
      this.continueRoot = root;
      this.preorder = false; // qty_ordered luôn = phần thiếu, không cần toggle
      this.items.set(
        root.outstanding_items.map((o) => ({
          product_id: o.product_id,
          name: o.name,
          qty: o.outstanding,          // mặc định nhận đủ phần thiếu (sửa được)
          cost: Number(o.cost ?? 0),
          qty_ordered: o.outstanding,  // số đặt = phần thiếu của chuỗi
        }))
      );
      // Áp dụng thanh toán như phiếu mới (mặc định trả đủ phần này)
      this.paid = true;
      this.paidAmount = 0;
      if (root.supplier_id && this.suppliers().some((s) => s.id === root.supplier_id)) {
        this.supplierId = root.supplier_id;
      } else if (root.supplier_name) {
        this.supplierManual = root.supplier_name;
      }
      this.note = `Nhập tiếp phần thiếu ${root.root_code}`;
    } catch (e: any) {
      console.error('load continue root failed', e);
      this.error = 'Không tải được phần còn thiếu của phiếu gốc.';
    }
  }

  get selectedSupplier(): Supplier | null {
    return this.suppliers().find((s) => s.id === this.supplierId) ?? null;
  }

  get total(): number {
    return this.items().reduce((s, i) => s + i.qty * i.cost, 0);
  }

  /** Số tiền sẽ ghi chi/thu trước trên phiếu này */
  get effectivePaid(): number {
    return this.paid ? this.total : Math.max(0, Math.min(Number(this.paidAmount) || 0, this.total));
  }

  /** Thêm nhanh NCC mới ngay trong form nhập hàng */
  async quickAddSupplier() {
    const alert = await this.alertCtrl.create({
      header: 'Thêm nhà cung cấp',
      inputs: [
        { name: 'name', type: 'text', placeholder: 'Tên NCC *' },
        { name: 'phone', type: 'text', placeholder: 'Số điện thoại' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Lưu',
          handler: async (data) => {
            const name = String(data.name ?? '').trim();
            if (!name) return false;
            try {
              const created = await this.suppliersService.create({
                name,
                phone: String(data.phone ?? '').trim() || null,
                note: null,
              });
              this.suppliers.set([...this.suppliers(), created]);
              this.supplierId = created.id;
              const t = await this.toastCtrl.create({ message: `Đã thêm NCC ${created.name}`, duration: 1500, color: 'success', position: 'bottom' });
              await t.present();
              return true;
            } catch (e: any) {
              const t = await this.toastCtrl.create({ message: e?.message ?? 'Thêm NCC thất bại', duration: 2000, color: 'danger', position: 'bottom' });
              await t.present();
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
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
      if (existing.qty_ordered != null) existing.qty_ordered += 1;
    } else {
      current.push({
        product_id: productId,
        name: product.name,
        qty: 1,
        cost: Number(product.cost ?? product.price ?? 0),
        qty_ordered: this.showQtyOrdered ? 1 : undefined,
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
    if (this.effectivePaid < this.total && !this.selectedSupplier) {
      this.error = 'Nhập nợ cần chọn nhà cung cấp để ghi công nợ (hoặc trả đủ).';
      return;
    }

    this.busy.set(true);
    try {
      const sup = this.selectedSupplier;
      // Gửi qty_ordered khi bật "đặt trước" hoặc đang nhập tiếp phần thiếu — v29
      const payloadItems: ReceivedNoteItem[] = this.items().map((i) =>
        this.showQtyOrdered && i.qty_ordered != null && Number(i.qty_ordered) > 0
          ? { ...i, qty: Number(i.qty), qty_ordered: Number(i.qty_ordered) }
          : { ...i, qty: Number(i.qty) }
      );
      const created = await this.notesService.create(
        {
          supplier_name: sup?.name ?? this.supplierManual.trim() ?? null,
          supplier_id: sup?.id ?? null,
          paid: this.paid,
          paid_amount: this.effectivePaid,
          due_date: this.dueDate || null,
          note: this.note.trim() || null,
          parent_id: this.continueRoot?.root_id ?? null,
        },
        payloadItems
      );
      const t = await this.toastCtrl.create({
        message: created.status === 'pending'
          ? `Đã gửi ${created.code} — chờ chủ shop duyệt, chưa ghi tồn kho`
          : created.status === 'partial'
            ? `Đã nhập ${created.code} (thiếu hàng) — xem "Chờ nhập thêm"`
            : `Đã nhập hàng ${created.code} — tồn kho đã cập nhật`,
        duration: 2400,
        color: created.status === 'pending' ? 'warning' : 'success',
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

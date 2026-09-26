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
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonInput,
  IonTextarea,
  IonToggle,
  IonCheckbox,
  IonSelect,
  IonSelectOption,
  IonChip,
  IonItem,
  IonModal,
  AlertController,
  ActionSheetController,
  ToastController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  optionsOutline,
  checkmarkOutline,
  barcodeOutline,
  addOutline,
  imageOutline,
  imagesOutline,
  sparklesOutline,
  trashOutline,
  printOutline,
  copyOutline,
} from 'ionicons/icons';
import JsBarcode from 'jsbarcode';
import { ProductsService } from '../../core/services/products.service';
import { Product, ProductUnit, CustomField } from '../../core/models/models';

type EditTab = 'basic' | 'custom';

/** Đồng phục kiểm tra số nhập tay: "15.000" / "15,000.5" -> number */
const toNum = (s: unknown): number | null => {
  const v = String(s ?? '').replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
  if (!v || v === '-') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

/**
 * Trang THÊM/SỬA SẢN PHẨM — clone 100% ISale live (#/product/update/:id, audit 09/2026):
 *  - Header: ✕ Đóng + "Sửa sản phẩm" đậm + phải: ⛁ (tuỳ chọn: in/nhân bản/xóa) + "✓ Lưu" tím
 *  - 2 tab chữ pill: Cơ bản | Trường tùy chỉnh
 *  - Cơ bản: card Mã vạch (nhập tay/nút Sinh mã/Nhiều mã vạch), Mã/SKU + Tên,
 *    Mục (+ Thêm), Đơn vị cơ bản/Giá nhập/Giá bán/Số lượng (+.00 .000, stepper),
 *    card Thêm đơn vị (Mặc định/Giá/Giá nhập/Quy đổi), 4 card toggle
 *    (combo, tự trừ NVL, dịch vụ, Serial/IMEI) với mô tả gốc, Hạn sử dụng + Ngoại tệ,
 *    Giá nhập (ng ngoại tệ) + Mô tả sản phẩm, card Ảnh ([Chọn nhiều] + AI),
 *    Cấu hình Website (Hiện trên web/Bán chạy/Mới/Hiện giá) + Khuyến mại?, nút Phân loại
 *  - Trường tùy chỉnh: empty state + thêm/xoá trường (custom_fields)
 */
@Component({
  selector: 'app-product-edit',
  templateUrl: './product-edit.page.html',
  styleUrls: ['./product-edit.page.scss'],
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
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonInput,
    IonTextarea,
    IonToggle,
    IonCheckbox,
    IonSelect,
    IonSelectOption,
    IonChip,
    IonItem,
    IonModal,
    FormsModule,
  ],
})
export class ProductEditPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private productsService = inject(ProductsService);
  private alertCtrl = inject(AlertController);
  private sheetCtrl = inject(ActionSheetController);
  private toastCtrl = inject(ToastController);

  readonly productId = signal<string | null>(null);
  readonly busy = signal(false);
  readonly deleting = signal(false);
  readonly uploading = signal(false);
  readonly tab = signal<EditTab>('basic');

  /** Modal phụ */
  readonly barcodesOpen = signal(false);
  readonly classifyOpen = signal(false);
  readonly categories = signal<{ id: string; name: string }[]>([]);

  error = '';

  // ===== Trường form (bind chuỗi như ô nhập ISale, parse khi Lưu) =====
  name = '';
  sku = '';
  unit = '';
  priceStr = '';
  costStr = '';
  stockStr = '';
  barcode = '';
  expiryDate = '';
  giaNhapNtStr = '';
  ngoaiTeMa = '';
  moTa = '';

  laCombo = false;
  tuTruNvl = false;
  dichVu = false;
  serialManaged = false;
  hienTrenWeb = true;
  banChay = false;
  moi = false;
  hienGiaWeb = false;
  khuyenMai = false;

  categoryId = signal<string | null>(null);
  tags = signal<string[]>([]);
  units = signal<ProductUnit[]>([]);
  barcodes = signal<string[]>([]);
  customFields = signal<CustomField[]>([]);
  images = signal<string[]>([]);
  image = '';

  readonly CURRENCIES = ['USD', 'EUR', 'CNY', 'JPY', 'KRW', 'AUD', 'SGD'];

  constructor() {
    addIcons({
      closeOutline,
      optionsOutline,
      checkmarkOutline,
      barcodeOutline,
      addOutline,
      imageOutline,
      imagesOutline,
      sparklesOutline,
      trashOutline,
      printOutline,
      copyOutline,
    });
  }

  get isEdit(): boolean {
    return !!this.productId();
  }

  get pageTitle(): string {
    return this.isEdit ? 'Sửa sản phẩm' : 'Thêm sản phẩm';
  }

  get categoryName(): string {
    return this.categories().find((c) => c.id === this.categoryId())?.name ?? '';
  }

  async ngOnInit(): Promise<void> {
    void this.loadCategories();
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'add') {
      this.productId.set(id);
      await this.loadProduct(id);
    }
  }

  private async loadCategories() {
    try {
      this.categories.set(await this.productsService.listCategories());
    } catch {
      this.categories.set([]);
    }
  }

  private async loadProduct(id: string) {
    this.busy.set(true);
    try {
      const p = await this.productsService.get(id);
      if (p) {
        this.name = p.name;
        this.sku = p.sku ?? '';
        this.unit = p.unit ?? '';
        this.priceStr = p.price != null ? String(p.price) : '';
        this.costStr = p.cost != null ? String(p.cost) : '';
        this.stockStr = String(p.stock ?? 0);
        this.barcode = p.barcode ?? '';
        this.expiryDate = p.expiry_date ?? '';
        this.image = p.image ?? '';
        this.images.set(p.images ?? []);
        this.moTa = p.mo_ta ?? '';
        this.giaNhapNtStr = p.gia_nhap_nt != null ? String(p.gia_nhap_nt) : '';
        this.ngoaiTeMa = p.ngoai_te_tien_te ?? '';
        this.laCombo = !!p.la_combo;
        this.tuTruNvl = !!p.tu_tru_nvl;
        this.dichVu = !!p.dich_vu;
        this.serialManaged = !!p.serial_managed;
        this.hienTrenWeb = p.hien_tren_web !== false;
        this.banChay = !!p.ban_chay;
        this.moi = !!p.moi;
        this.hienGiaWeb = !!p.hien_gia_web;
        this.khuyenMai = !!p.khuyen_mai;
        this.categoryId.set(p.category_id ?? null);
        this.tags.set(p.tags ?? []);
        this.units.set((p.units ?? []).map((u) => ({ ...u })));
        this.barcodes.set(p.barcodes ?? []);
        this.customFields.set(p.custom_fields ?? []);
      }
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Không tải được sản phẩm.';
    } finally {
      this.busy.set(false);
    }
  }

  // ===== Mã vạch =====
  /** Nút "Mã vạch": focus vào ô nhập mã vạch (quét đầu đọc) */
  focusBarcode(bcInput: HTMLInputElement) {
    bcInput.focus();
  }

  /** Nút "Sinh mã": dãy 13 số ngẫu nhiên (EAN-13 tương thích) */
  sinhMa() {
    let code = '';
    for (let i = 0; i < 13; i++) code += Math.floor(Math.random() * 10);
    this.barcode = code;
  }

  /** Helper cho template: parse chuỗi nhập tay thành số */
  toNumPublic(v: unknown): number | null {
    return toNum(v);
  }

  /** Nút .00/.000 của hàng đơn vị: nối phần thập phân rồi parse lại */
  unitAppendDecimals(u: ProductUnit, field: 'price' | 'cost', suffix: string) {
    const raw = String((field === 'price' ? u.price : u.cost) ?? 0);
    const n = toNum(raw + suffix);
    if (field === 'price') u.price = n;
    else u.cost = n;
  }

  async addBarcode() {
    const alert = await this.alertCtrl.create({
      header: 'Thêm mã vạch',
      inputs: [{ name: 'code', type: 'text', placeholder: 'Nhập dãy mã vạch' }],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Thêm',
          handler: (d) => {
            const code = String(d.code ?? '').trim();
            if (!code) return false;
            this.barcodes.update((list) => [...list, code]);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  removeBarcode(index: number) {
    this.barcodes.update((list) => list.filter((_, i) => i !== index));
  }

  // ===== Mục (nhóm hàng) =====
  async pickCategory() {
    const buttons = this.categories().map((c) => ({
      text: c.name,
      handler: () => {
        this.categoryId.set(c.id);
      },
    }));
    if (this.categoryId()) {
      buttons.push({
        text: '— Bỏ nhóm hàng —',
        handler: () => {
          this.categoryId.set(null);
        },
      });
    }
    const sheet = await this.sheetCtrl.create({
      header: 'Chọn Nhóm hàng',
      buttons: [...buttons, { text: 'Hủy', role: 'cancel' }],
    });
    await sheet.present();
  }

  removeCategory() {
    this.categoryId.set(null);
  }

  // ===== Thẻ phân loại (modal Phân loại) =====
  async addTags() {
    const alert = await this.alertCtrl.create({
      header: 'Thêm thẻ phân loại',
      message: 'Nhập các thẻ, phân cách bởi dấu phẩy.',
      inputs: [{ name: 'tags', type: 'text', placeholder: 'VD: bán chạy, mới về' }],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Thêm',
          handler: (d) => {
            const incoming = String(d.tags ?? '')
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean);
            if (!incoming.length) return false;
            this.tags.update((list) => [...new Set([...list, ...incoming])]);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  removeTag(index: number) {
    this.tags.update((list) => list.filter((_, i) => i !== index));
  }

  // ===== Đơn vị thay thế (card Thêm đơn vị) =====
  addUnitRow() {
    this.units.update((list) => [...list, { name: '', conversion: 1, price: null, cost: null, is_default: false }]);
  }

  removeUnitRow(index: number) {
    this.units.update((list) => list.filter((_, i) => i !== index));
  }

  markDefaultUnit(index: number) {
    this.units.update((list) => list.map((u, i) => ({ ...u, is_default: i === index })));
  }

  /** Bấm ".00"/".000": thêm phần thập phân vào ô giá (như ISale) */
  appendDecimals(field: 'price' | 'cost' | 'nt', suffix: string) {
    if (field === 'price') this.priceStr = (this.priceStr || '0') + suffix;
    else if (field === 'cost') this.costStr = (this.costStr || '0') + suffix;
    else this.giaNhapNtStr = (this.giaNhapNtStr || '0') + suffix;
  }

  /** Stepper Số lượng: − / + chỉnh 1 đơn vị */
  stepStock(delta: number) {
    const cur = toNum(this.stockStr) ?? 0;
    this.stockStr = String(Math.round((cur + delta) * 10) / 10);
  }

  // ===== Ảnh =====
  async onPickImages(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;
    this.uploading.set(true);
    try {
      const urls: string[] = [];
      for (const f of files) {
        if (!f.type.startsWith('image/')) continue;
        if (f.size > 5 * 1024 * 1024) {
          await this.toast('Ảnh quá lớn (tối đa 5MB): ' + f.name, 'danger');
          continue;
        }
        urls.push(await this.productsService.uploadImage(f));
      }
      if (urls.length) {
        this.images.update((list) => [...list, ...urls]);
        if (!this.image) this.image = urls[0];
        await this.toast(`Đã tải lên ${urls.length} ảnh`);
      }
    } catch (e: unknown) {
      await this.toast(e instanceof Error ? e.message : 'Tải ảnh lên thất bại.', 'danger');
    } finally {
      this.uploading.set(false);
      input.value = '';
    }
  }

  removeImage(index: number) {
    const removed = this.images()[index];
    this.images.update((list) => list.filter((_, i) => i !== index));
    if (this.image === removed) this.image = this.images()[0] ?? '';
  }

  aiProcess() {
    void this.toast('Xử lý ảnh với AI đang hoàn thiện — sắp ra mắt!', 'primary', 2200);
  }

  // ===== Trường tùy chỉnh (tab 2) =====
  async addCustomField() {
    const alert = await this.alertCtrl.create({
      header: 'Thêm trường tùy chỉnh',
      inputs: [
        { name: 'key', type: 'text', placeholder: 'Tên trường (VD: Xuất xứ)' },
        { name: 'value', type: 'text', placeholder: 'Giá trị (VD: Việt Nam)' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Thêm',
          handler: (d) => {
            const key = String(d.key ?? '').trim();
            if (!key) return false;
            this.customFields.update((list) => [...list, { key, value: String(d.value ?? '').trim() || null }]);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  removeCustomField(index: number) {
    this.customFields.update((list) => list.filter((_, i) => i !== index));
  }

  // ===== LƯU =====
  async save() {
    this.error = '';
    if (!this.name.trim()) {
      this.error = 'Vui lòng nhập tên sản phẩm.';
      return;
    }
    const price = toNum(this.priceStr);
    const payload: Partial<Product> = {
      name: this.name.trim(),
      sku: this.sku.trim() || null,
      unit: this.unit.trim() || 'Cái',
      price: price ?? 0,
      cost: toNum(this.costStr),
      stock: toNum(this.stockStr) ?? 0,
      barcode: this.barcode.trim() || null,
      expiry_date: this.expiryDate || null,
      image: this.image || null,
      images: this.images(),
      units: this.units()
        .filter((u) => u.name.trim())
        .map((u) => ({
          name: u.name.trim(),
          conversion: u.conversion || 1,
          price: u.price ?? null,
          cost: u.cost ?? null,
          is_default: !!u.is_default,
        })),
      barcodes: this.barcodes(),
      custom_fields: this.customFields(),
      tags: this.tags(),
      category_id: this.categoryId() ?? null,
      dich_vu: this.dichVu,
      serial_managed: this.serialManaged,
      ngoai_te: !!this.ngoaiTeMa,
      ngoai_te_tien_te: this.ngoaiTeMa || null,
      gia_nhap_nt: toNum(this.giaNhapNtStr),
      mo_ta: this.moTa.trim() || null,
      la_combo: this.laCombo,
      tu_tru_nvl: this.tuTruNvl,
      hien_tren_web: this.hienTrenWeb,
      ban_chay: this.banChay,
      moi: this.moi,
      hien_gia_web: this.hienGiaWeb,
      khuyen_mai: this.khuyenMai,
    };
    if (!this.isEdit) payload.active = true;

    this.busy.set(true);
    try {
      if (this.isEdit) {
        await this.productsService.update(this.productId()!, payload);
        await this.toast('Đã lưu sản phẩm');
        this.router.navigateByUrl('/product', { replaceUrl: true });
      } else {
        await this.productsService.create(payload);
        await this.toast('Đã thêm sản phẩm');
        this.router.navigateByUrl('/product', { replaceUrl: true });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.error = this.translateError(msg);
    } finally {
      this.busy.set(false);
    }
  }

  private translateError(msg: string): string {
    const m = (msg || '').toLowerCase();
    if (m.includes('row-level security')) return 'Không có quyền thực hiện. Kiểm tra lại đăng nhập.';
    if (m.includes('pgrst204') || m.includes('column')) return `Lưu thất bại: ${msg} — Hãy chạy migration v19–v21 trong Supabase.`;
    return msg;
  }

  // ===== ⛁ Tuỳ chọn: in mã vạch / nhân bản / xóa =====
  async openOptions() {
    const sheet = await this.sheetCtrl.create({
      header: 'Tùy chọn',
      buttons: [
        ...(this.isEdit
          ? [
              { text: 'In mã vạch', handler: () => this.printBarcode() },
              { text: 'Nhân bản sản phẩm', handler: () => void this.copyProduct() },
              { text: 'Xóa sản phẩm', role: 'destructive', handler: () => void this.confirmDelete() },
            ]
          : []),
        { text: 'Hủy', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  printBarcode() {
    const value = (this.barcode || this.sku || '').trim();
    if (!value) {
      void this.toast('Chưa có mã vạch để in.', 'primary');
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, value, { format: 'CODE128', width: 2, height: 72, displayValue: true, fontSize: 14, margin: 8 });
      const url = canvas.toDataURL('image/png');
      const w = window.open('', '_blank', 'width=520,height=360');
      if (!w) return;
      w.document.write(
        `<html><head><title>In mã vạch</title></head><body style="display:flex;align-items:center;justify-content:center;margin:0"><img src="${url}" onload="window.focus();window.print()" style="max-width:90%"/></body></html>`
      );
      w.document.close();
    } catch {
      void this.toast('Mã vạch không hợp lệ để in.', 'danger');
    }
  }

  async copyProduct() {
    const p = await this.productsService.get(this.productId()!);
    if (!p) return;
    const created = await this.productsService.create({
      name: p.name + ' (bản sao)',
      sku: p.sku,
      unit: p.unit,
      price: p.price,
      cost: p.cost,
      stock: 0,
      category_id: p.category_id,
      active: p.active,
      serial_managed: p.serial_managed,
      expiry_date: p.expiry_date,
      barcode: p.barcode,
      image: p.image,
      units: p.units,
      images: p.images,
      price_wholesale: p.price_wholesale,
      price_ctv: p.price_ctv,
      discounts: p.discounts,
      options: p.options,
      tags: p.tags,
      dich_vu: p.dich_vu,
      ngoai_te: p.ngoai_te,
      gia_nhap_nt: p.gia_nhap_nt,
      hien_tren_web: p.hien_tren_web,
      ban_chay: p.ban_chay,
      moi: p.moi,
      hien_gia_web: p.hien_gia_web,
      khuyen_mai: p.khuyen_mai,
      mo_ta: p.mo_ta,
      price_settings: p.price_settings,
      barcodes: p.barcodes,
      custom_fields: p.custom_fields,
      la_combo: p.la_combo,
      tu_tru_nvl: p.tu_tru_nvl,
      ngoai_te_tien_te: p.ngoai_te_tien_te,
    });
    await this.toast('Đã nhân bản — đang mở bản sao');
    this.router.navigateByUrl(`/product/update/${created.id}`, { replaceUrl: true });
  }

  async confirmDelete() {
    if (!this.isEdit) return;
    const alert = await this.alertCtrl.create({
      header: 'Xóa sản phẩm',
      message: `Bạn chắc chắn muốn xóa "${this.name}"?`,
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
      await this.productsService.remove(this.productId()!);
      await this.toast('Đã xóa sản phẩm');
      this.router.navigateByUrl('/product', { replaceUrl: true });
    } catch (e: unknown) {
      await this.toast(e instanceof Error ? e.message : 'Xóa thất bại', 'danger');
    } finally {
      this.deleting.set(false);
    }
  }

  goBack() {
    this.router.navigateByUrl('/product', { replaceUrl: true });
  }

  private async toast(message: string, color: string = 'success', duration = 1800) {
    const t = await this.toastCtrl.create({ message, duration, color, position: 'bottom' });
    await t.present();
  }
}

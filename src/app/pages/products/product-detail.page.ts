import { Component, OnInit, effect, inject, signal, viewChild, ElementRef, computed } from '@angular/core';
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
  IonItem,
  IonLabel,
  IonToggle,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonChip,
  IonModal,
  AlertController,
  ActionSheetController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  settingsOutline,
  createOutline,
  ellipsisVertical,
  optionsOutline,
  addOutline,
  barcodeOutline,
  homeOutline,
  layersOutline,
  calculatorOutline,
  trashOutline,
  funnelOutline,
  sparklesOutline,
  cubeOutline,
  closeOutline,
  printOutline,
  arrowDownOutline,
  arrowUpOutline,
} from 'ionicons/icons';
import JsBarcode from 'jsbarcode';
import { ProductsService, ProductHistoryRow } from '../../core/services/products.service';
import {
  Product,
  ProductUnit,
  ProductDiscount,
  ProductOption,
  PriceSetting,
  CustomField,
} from '../../core/models/models';

type TabKey = 'info' | 'units' | 'history' | 'images' | 'prices' | 'discounts';

/** Trường chữ/số có thể sửa nhanh tại chỗ (alert) */
type EditableKey = 'barcode' | 'sku' | 'name' | 'stock' | 'price' | 'cost' | 'unit' | 'expiry_date' | 'gia_nhap_nt' | 'mo_ta';

/** Cờ boolean lưu trực tiếp vào các cột migration v20 */
type FlagKey = 'active' | 'serial_managed' | 'dich_vu' | 'ngoai_te' | 'hien_tren_web' | 'ban_chay' | 'moi' | 'hien_gia_web' | 'khuyen_mai';

/**
 * Trang "Chi tiết sản phẩm" — clone 100% ISale live (audit 09/2026):
 *  - Toolbar: ← + title tím + phải: ⚙ (cấu hình) | ✏ (sửa) | ⋮ (thêm: barcode/in/nhân bản/xóa)
 *  - Segment 6 tab CHỮ (không icon), pill tím khi active:
 *    Chi tiết | Đơn vị khác | Lịch sử Nhập/Xuất | Ảnh | Giá khách & CTV | Chiết khấu
 *  - Tab Chi tiết: 3 chip màu (Phân loại tím / Nhiều mã vạch xanh / Trường tùy chỉnh teal),
 *    lưới trường 2 cột + dàn toggle lưu ngay + panel mã vạch canvas (Code128)
 *  - Đơn vị khác: card đơn vị cơ bản + thẻ thay thế kèm phép quy đổi
 *  - Lịch sử: card lọc "Từ … đến …" + Tổng tiền, funnel làm mới
 *  - Ảnh: nút "XỬ LÝ ẢNH VỚI AI" + thư viện
 *  - Giá khách & CTV / Chiết khấu: card Tổng + (+) + danh sách + empty nét đứt
 */
@Component({
  selector: 'app-product-detail',
  templateUrl: './product-detail.page.html',
  styleUrls: ['./product-detail.page.scss'],
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
    IonItem,
    IonLabel,
    IonToggle,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    IonChip,
    IonModal,
  ],
})
export class ProductDetailPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private productsService = inject(ProductsService);
  private alertCtrl = inject(AlertController);
  private sheetCtrl = inject(ActionSheetController);
  private toastCtrl = inject(ToastController);

  readonly productId = signal<string | null>(null);
  readonly product = signal<Product | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly deleting = signal(false);

  /** Tab hiện tại (mặc định: Chi tiết) — 6 tab như ISale live */
  readonly tab = signal<TabKey>('info');

  /** Modal phụ (chip Phân loại / Nhiều mã vạch / Trường tùy chỉnh) */
  readonly classifyOpen = signal(false);
  readonly barcodesOpen = signal(false);
  readonly customOpen = signal(false);

  /** Panel mã vạch (mở từ menu ⋮ → Xem mã vạch) */
  readonly barcodePanelOpen = signal(false);

  /** Khoảng lọc lịch sử (mặc định: 30 ngày gần nhất như ISale) */
  readonly histFrom = signal(this.isoDate(new Date(Date.now() - 30 * 86400000)));
  readonly histTo = signal(this.isoDate(new Date()));

  readonly barcodeCanvasRef = viewChild<ElementRef<HTMLCanvasElement>>('bcv');

  /** Lịch sử Nhập/Xuất (lazy) + lọc theo khoảng ngày */
  readonly history = signal<ProductHistoryRow[]>([]);
  readonly historyLoading = signal(false);
  private historyLoaded = false;
  readonly historyFiltered = computed(() => {
    const fromT = this.histFrom() ? new Date(this.histFrom() + 'T00:00:00').getTime() : null;
    const toT = this.histTo() ? new Date(this.histTo() + 'T23:59:59.999').getTime() : null;
    return this.history().filter((h) => {
      const t = h.date ? new Date(h.date).getTime() : NaN;
      if (isNaN(t)) return true;
      if (fromT != null && t < fromT) return false;
      if (toT != null && t > toT) return false;
      return true;
    });
  });
  /** Tổng tiền khoảng lọc: nhập (+), xuất (−) — hiển thị "Tổng: +0 ₫" như ISale */
  readonly historyTotal = computed(() => {
    let s = 0;
    for (const h of this.historyFiltered()) s += h.kind === 'in' ? h.amount : -h.amount;
    return s;
  });

  /** Nhóm hàng cho modal Phân loại (lazy) */
  readonly categories = signal<{ id: string; name: string }[]>([]);
  private catsLoaded = false;

  constructor() {
    addIcons({
      arrowBackOutline,
      settingsOutline,
      createOutline,
      ellipsisVertical,
      optionsOutline,
      addOutline,
      barcodeOutline,
      homeOutline,
      layersOutline,
      calculatorOutline,
      trashOutline,
      funnelOutline,
      sparklesOutline,
      cubeOutline,
      closeOutline,
      printOutline,
      arrowDownOutline,
      arrowUpOutline,
    });

    // Vẽ mã vạch khi panel được mở (canvas nằm trong @if)
    effect(() => {
      const open = this.barcodePanelOpen();
      const canvas = this.barcodeCanvasRef();
      if (open && canvas && !this.loading()) {
        queueMicrotask(() => this.drawBarcode());
      }
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.productId.set(id);
      this.load(id);
    }
  }

  private async load(id: string) {
    this.loading.set(true);
    try {
      const p = await this.productsService.get(id);
      this.product.set(p);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.toast(msg || 'Không tải được sản phẩm.', 'danger');
    } finally {
      this.loading.set(false);
    }
  }

  // ===== Getters an toàn (cột v19/v20 có thể chưa có nếu chưa chạy migration) =====
  get units(): ProductUnit[] {
    return this.product()?.units ?? [];
  }
  get gallery(): string[] {
    return this.product()?.images ?? [];
  }
  get discounts(): ProductDiscount[] {
    return this.product()?.discounts ?? [];
  }
  get options(): ProductOption[] {
    return this.product()?.options ?? [];
  }
  get tags(): string[] {
    return this.product()?.tags ?? [];
  }
  get barcodeList(): string[] {
    return this.product()?.barcodes ?? [];
  }
  get customFields(): CustomField[] {
    return this.product()?.custom_fields ?? [];
  }

  /** Giá khách & CTV: đọc từ price_settings; nếu trống thì tổng hợp từ cột cũ v19 */
  get priceSettings(): PriceSetting[] {
    const list = this.product()?.price_settings;
    if (list && list.length) return list;
    const p = this.product();
    const synth: PriceSetting[] = [];
    if (p?.price_wholesale != null) synth.push({ type: 'Khách sỉ', name: 'Giá bán buôn', price: p.price_wholesale });
    if (p?.price_ctv != null) synth.push({ type: 'CTV', name: 'Giá CTV', price: p.price_ctv });
    return synth;
  }

  /** Giá trên đơn vị cơ bản khi quy đổi: price ÷ conversion */
  unitPerBase(price: number | null | undefined, conversion: number): number | null {
    if (price == null || !conversion) return null;
    return price / conversion;
  }

  // ===== Chuyển tab — lazy load =====
  async onTabChange(ev: CustomEvent) {
    const v = (ev.detail as { value: TabKey }).value;
    this.tab.set(v);
    if (v === 'history' && !this.historyLoaded) await this.loadHistory();
  }

  private async loadHistory() {
    if (!this.productId()) return;
    this.historyLoading.set(true);
    try {
      this.history.set(await this.productsService.getHistory(this.productId()!));
    } catch {
      this.history.set([]);
    } finally {
      this.historyLoading.set(false);
      this.historyLoaded = true;
    }
  }

  private async loadCategories() {
    try {
      this.categories.set(await this.productsService.listCategories());
    } catch {
      this.categories.set([]);
    } finally {
      this.catsLoaded = true;
    }
  }

  /** Funnel: tải lại lịch sử theo khoảng đang chọn */
  async refreshHistory() {
    this.historyLoaded = false;
    await this.loadHistory();
  }

  /** Lưu 1 phần dữ liệu sản phẩm + cập nhật state local */
  private async save(patch: Partial<Product>, okMsg = 'Đã lưu') {
    if (!this.productId()) return;
    try {
      await this.productsService.update(this.productId()!, patch);
      this.product.update((p) => (p ? { ...p, ...patch } : p));
      await this.toast(okMsg, 'success');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.toast(`Lỗi lưu: ${msg}. Hãy chạy migration v19/v20 trong Supabase trước.`, 'danger', 4200);
    }
  }

  // ===== Tab: CHI TIẾT — sửa nhanh từng trường (Isale: ✏️ mỗi trường) =====
  async editField(key: EditableKey) {
    const p = this.product();
    if (!p) return;
    const meta: Record<EditableKey, { label: string; type: string }> = {
      barcode: { label: 'Mã vạch', type: 'text' },
      sku: { label: 'Mã SP', type: 'text' },
      name: { label: 'Tiêu đề sản phẩm', type: 'text' },
      stock: { label: 'Số lượng', type: 'number' },
      price: { label: 'Giá bán (₫)', type: 'number' },
      cost: { label: 'Giá nhập (₫)', type: 'number' },
      unit: { label: 'Đơn vị', type: 'text' },
      expiry_date: { label: 'Ngày hết hạn', type: 'date' },
      gia_nhap_nt: { label: 'Giá nhập (ngoại tệ)', type: 'text' },
      mo_ta: { label: 'Mô tả', type: 'text' },
    };
    const cur = (p[key] ?? '') as string | number | null;
    const alert = await this.alertCtrl.create({
      header: `Sửa ${meta[key].label}`,
      inputs: [{ name: 'v', type: meta[key].type as 'text', value: cur == null ? '' : String(cur) }],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Lưu',
          handler: (d) => {
            const raw = String(d.v ?? '').trim();
            let patch: Partial<Product> = {};
            if (key === 'stock') patch = { stock: this.num(raw) ?? 0 };
            else if (key === 'price' || key === 'cost') patch = { [key]: this.num(raw) };
            else if (key === 'gia_nhap_nt') patch = { gia_nhap_nt: raw === '' ? null : (Number(raw) || null) };
            else if (key === 'expiry_date') patch = { expiry_date: raw === '' ? null : raw };
            else patch = { [key]: raw === '' ? null : raw };
            void this.save(patch, `Đã cập nhật ${meta[key].label.toLowerCase()}`);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  /** Bật/tắt các công tắc — lưu ngay (Isale: toggle từng trường) */
  async toggleFlag(key: FlagKey, ev: Event) {
    const checked = (ev as CustomEvent).detail?.checked as boolean;
    const patch: Partial<Product> = { [key]: checked };
    await this.save(patch, checked ? 'Đã bật' : 'Đã tắt');
  }

  /** Mở tab Ảnh từ ô "Ảnh" trong lưới */
  openImagesTab() {
    this.tab.set('images');
  }

  aiProcess() {
    void this.toast('Xử lý ảnh với AI đang hoàn thiện — sắp ra mắt!', 'primary', 2200);
  }

  // ===== Mã vạch (panel canvas Code128 như ISale) =====
  private drawBarcode() {
    const canvas = this.barcodeCanvasRef()?.nativeElement;
    const p = this.product();
    if (!canvas || !p) return;
    const value = (p.barcode || p.sku || p.id || '').trim() || p.id;
    try {
      JsBarcode(canvas, value, {
        format: 'CODE128',
        width: 2,
        height: 72,
        displayValue: true,
        fontSize: 14,
        margin: 8,
        background: '#ffffff',
        lineColor: '#000000',
      });
    } catch {
      // giá trị không hợp lệ cho CODE128 — vẽ tối thiểu để không vỡ UI
      try {
        JsBarcode(canvas, value.replace(/[^A-Za-z0-9\-\.\ \$\/\+\%]/g, '') || '0', { format: 'CODE128', height: 72 });
      } catch {
        /* bỏ qua */
      }
    }
  }

  printBarcode() {
    const canvas = this.barcodeCanvasRef()?.nativeElement;
    if (!canvas) {
      this.barcodePanelOpen.set(true);
      this.tab.set('info');
      void this.toast('Đã mở mã vạch — bấm In lần nữa để in.', 'primary');
      return;
    }
    const url = canvas.toDataURL('image/png');
    const w = window.open('', '_blank', 'width=520,height=360');
    if (!w) return;
    w.document.write(`<html><head><title>In mã vạch</title></head><body style="display:flex;align-items:center;justify-content:center;margin:0"><img src="${url}" onload="window.focus();window.print()" style="max-width:90%"/></body></html>`);
    w.document.close();
  }

  // ===== Tab: ĐƠN VỊ KHÁC =====
  async addUnit() {
    const p = this.product();
    const alert = await this.alertCtrl.create({
      header: 'Thêm đơn vị thay thế',
      message: `1 đơn vị mới = ? ${p?.unit || 'sản phẩm'}`,
      inputs: [
        { name: 'name', type: 'text', placeholder: 'Tên đơn vị (VD: Thùng (1000))' },
        { name: 'conversion', type: 'number', placeholder: `1 ${p?.unit || 'SP'} = ? — nhập hệ số (VD: 40)`, value: '1', min: 0 },
        { name: 'price', type: 'number', placeholder: 'Giá bán của đơn vị này (₫)', min: 0 },
        { name: 'cost', type: 'number', placeholder: 'Giá nhập của đơn vị này (₫)', min: 0 },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Thêm',
          handler: (d) => {
            const name = String(d.name ?? '').trim();
            if (!name) return false;
            const list: ProductUnit[] = [
              ...this.units,
              { name, conversion: this.num(d.conversion) || 1, price: this.num(d.price), cost: this.num(d.cost) },
            ];
            void this.save({ units: list }, 'Đã thêm đơn vị thay thế');
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  async removeUnit(index: number) {
    await this.save({ units: this.units.filter((_, i) => i !== index) }, 'Đã xóa đơn vị');
  }

  // ===== Tab: ẢNH (thư viện) =====
  readonly imgInputRef = viewChild<ElementRef<HTMLInputElement>>('imgInput');

  async onPickImages(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;
    try {
      const urls: string[] = [];
      for (const f of files) {
        urls.push(await this.productsService.uploadImage(f));
      }
      await this.save({ images: [...this.gallery, ...urls] }, `Đã tải lên ${urls.length} ảnh`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.toast(`Lỗi tải ảnh: ${msg}`, 'danger', 3500);
    } finally {
      input.value = '';
    }
  }

  pickImages() {
    this.imgInputRef()?.nativeElement.click();
  }

  async imageActions(index: number) {
    const isMain = index === -1;
    const url = isMain ? this.product()?.image : this.gallery[index];
    const buttons: { text: string; role?: string; handler?: () => void }[] = [];
    if (!isMain && url && this.product()?.image !== url) {
      buttons.push({
        text: 'Đặt làm ảnh chính',
        handler: () => {
          void this.save({ image: url }, 'Đã đặt làm ảnh chính');
        },
      });
    }
    buttons.push({
      text: isMain ? 'Xóa ảnh chính' : 'Xóa ảnh',
      role: 'destructive',
      handler: () => {
        if (isMain) {
          void this.save({ image: null }, 'Đã xóa ảnh chính');
        } else {
          void this.save({ images: this.gallery.filter((_, i) => i !== index) }, 'Đã xóa ảnh');
        }
      },
    });
    buttons.push({ text: 'Hủy', role: 'cancel' });
    const sheet = await this.sheetCtrl.create({ header: 'Ảnh sản phẩm', buttons });
    await sheet.present();
  }

  // ===== Tab: GIÁ KHÁCH & CTV =====
  async addPrice() {
    const alert = await this.alertCtrl.create({
      header: 'Thêm thiết lập giá',
      inputs: [
        { type: 'radio', label: 'Khách sỉ', value: 'Khách sỉ', checked: true },
        { type: 'radio', label: 'CTV (cộng tác viên)', value: 'CTV' },
        { name: 'name', type: 'text', placeholder: 'Tên khách / nhóm khách' },
        { name: 'price', type: 'number', placeholder: 'Giá (₫)', min: 0 },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Thêm',
          handler: (d) => {
            const price = this.num(d.price);
            if (price == null || price < 0) return false;
            // nếu đang hiển thị dữ liệu tổng hợp từ cột cũ, "gọng" luôn vào danh sách để không mất
            const list: PriceSetting[] = [...this.priceSettings, { type: String(d.type || 'Khách sỉ'), name: String(d.name ?? '').trim() || null, price }];
            // đồng bộ ngược cột cũ (bản ghi Khách sỉ/CTV đầu tiên)
            const wholesale = list.find((x) => x.type === 'Khách sỉ')?.price ?? null;
            const ctv = list.find((x) => x.type === 'CTV')?.price ?? null;
            void this.save({ price_settings: list, price_wholesale: wholesale, price_ctv: ctv }, 'Đã thêm giá');
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  async removePrice(index: number) {
    const list = this.priceSettings.filter((_, i) => i !== index);
    const wholesale = list.find((x) => x.type === 'Khách sỉ')?.price ?? null;
    const ctv = list.find((x) => x.type === 'CTV')?.price ?? null;
    await this.save({ price_settings: list, price_wholesale: wholesale, price_ctv: ctv }, 'Đã xóa giá');
  }

  // ===== Tab: CHIẾT KHẤU =====
  async addDiscount() {
    const alert = await this.alertCtrl.create({
      header: 'Thêm chiết khấu',
      inputs: [
        { name: 'name', type: 'text', placeholder: 'Tên khách (tùy chọn)' },
        { name: 'min_qty', type: 'number', placeholder: 'Số lượng tối thiểu (VD: 10)', min: 1 },
        { name: 'percent', type: 'number', placeholder: 'Giảm bao nhiêu % (VD: 5)', min: 0, max: 100 },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Thêm',
          handler: (d) => {
            const minQty = this.num(d.min_qty);
            const percent = this.num(d.percent);
            if (!minQty || minQty < 1 || percent == null || percent < 0 || percent > 100) return false;
            const list: ProductDiscount[] = [
              ...this.discounts,
              { min_qty: minQty, percent, name: String(d.name ?? '').trim() || null },
            ];
            list.sort((a, b) => a.min_qty - b.min_qty);
            void this.save({ discounts: list }, 'Đã thêm chiết khấu');
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  async removeDiscount(index: number) {
    await this.save({ discounts: this.discounts.filter((_, i) => i !== index) }, 'Đã xóa chiết khấu');
  }

  // ===== Chip: PHÂN LOẠI (modal) =====
  async openClassify() {
    if (!this.catsLoaded) await this.loadCategories();
    this.classifyOpen.set(true);
  }

  closeClassify() {
    this.classifyOpen.set(false);
  }

  async onCategoryChange(ev: CustomEvent) {
    const v = (ev.detail as { value: string }).value;
    await this.save({ category_id: v === '' ? null : v }, 'Đã cập nhật nhóm hàng');
  }

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
            const merged = [...new Set([...this.tags, ...incoming])];
            void this.save({ tags: merged }, 'Đã thêm thẻ');
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  async removeTag(index: number) {
    await this.save({ tags: this.tags.filter((_, i) => i !== index) }, 'Đã xóa thẻ');
  }

  // ===== Chip: NHIỀU MÃ VẠCH (modal) =====
  closeBarcodes() {
    this.barcodesOpen.set(false);
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
            void this.save({ barcodes: [...this.barcodeList, code] }, 'Đã thêm mã vạch');
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  async removeBarcode(index: number) {
    await this.save({ barcodes: this.barcodeList.filter((_, i) => i !== index) }, 'Đã xóa mã vạch');
  }

  // ===== Chip: TRƯỜNG TÙY CHỈNH (modal) =====
  closeCustom() {
    this.customOpen.set(false);
  }

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
            const list: CustomField[] = [...this.customFields, { key, value: String(d.value ?? '').trim() || null }];
            void this.save({ custom_fields: list }, 'Đã thêm trường');
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  async removeCustomField(index: number) {
    await this.save({ custom_fields: this.customFields.filter((_, i) => i !== index) }, 'Đã xóa trường');
  }

  // ===== Nút (+) trên toolbar: thêm theo tab đang mở (như ISale) =====
  addItem() {
    switch (this.tab()) {
      case 'units':
        void this.addUnit();
        break;
      case 'images':
        this.pickImages();
        break;
      case 'prices':
        void this.addPrice();
        break;
      case 'discounts':
        void this.addDiscount();
        break;
      default:
        void this.toast('Chuyển sang tab Đơn vị khác / Ảnh / Giá / Chiết khấu để thêm mục.', 'primary');
    }
  }

  // ===== Điều hướng & hành động toolbar =====
  goBack() {
    this.router.navigateByUrl('/product', { replaceUrl: true });
  }

  /** ⚙ — cấu hình */
  async openSettings() {
    const sheet = await this.sheetCtrl.create({
      header: 'Cấu hình',
      buttons: [
        { text: 'Cấu hình chung…', handler: () => this.router.navigateByUrl('/config') },
        { text: 'Hủy', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  openEdit() {
    if (this.productId()) this.router.navigateByUrl(`/product/update/${this.productId()}`);
  }

  /** ⋮ — menu mở rộng: thêm theo tab / barcode / in / nhân bản / xóa (như ISale) */
  async openMore() {
    const sheet = await this.sheetCtrl.create({
      header: 'Tùy chọn',
      buttons: [
        { text: 'Thêm mục (+)', handler: () => this.addItem() },
        {
          text: 'Xem mã vạch',
          handler: () => {
            this.tab.set('info');
            this.barcodePanelOpen.set(true);
          },
        },
        { text: 'In mã vạch', handler: () => this.printBarcode() },
        { text: 'Thêm ảnh', handler: () => { this.tab.set('images'); setTimeout(() => this.pickImages(), 60); } },
        { text: 'Nhân bản', handler: () => void this.copyProduct() },
        { text: 'Xóa sản phẩm', role: 'destructive', handler: () => void this.confirmDelete() },
        { text: 'Hủy', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  async copyProduct() {
    const p = this.product();
    if (!p || this.busy()) return;
    const alert = await this.alertCtrl.create({
      header: 'Nhân bản/Sao chép',
      message: `Tạo sản phẩm mới từ "${p.name}"?`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Nhân bản',
          handler: () => this.doCopy(p),
        },
      ],
    });
    await alert.present();
  }

  private async doCopy(p: Product) {
    this.busy.set(true);
    try {
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
      });
      this.toast('Đã nhân bản sản phẩm');
      this.router.navigateByUrl(`/product/detail/${created.id}`, { replaceUrl: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.toast(msg || 'Nhân bản thất bại', 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  async confirmDelete() {
    const p = this.product();
    if (!p) return;
    const alert = await this.alertCtrl.create({
      header: 'Xóa sản phẩm',
      message:
        'Tất cả giao dịch thuộc sản phẩm này sẽ không bị xóa, tuy nhiên nội dung của sản phẩm này sẽ không thể khôi phục. Bạn có chắc muốn xóa?',
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
      this.toast('Đã xóa sản phẩm');
      this.router.navigateByUrl('/product', { replaceUrl: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.toast(msg || 'Xóa thất bại', 'danger');
    } finally {
      this.deleting.set(false);
    }
  }

  // ===== Helpers =====
  private num(v: unknown): number | null {
    const s = String(v ?? '').trim().replace(',', '.');
    if (!s) return null;
    const n = Number(s);
    return isNaN(n) ? null : n;
  }

  private isoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Ảnh lỗi → ẩn, hiện placeholder */
  hideImg(ev: Event) {
    const img = ev.target as HTMLImageElement;
    if (img) img.style.display = 'none';
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  /** "Tổng: +0 ₫" — luôn kèm dấu như ISale */
  formatSigned(v: number): string {
    return (v >= 0 ? '+' : '−') + this.formatMoney(Math.abs(v));
  }

  /** số lượng trong mô tả quy đổi: 540.000 ÷ 40 = 13.500 ₫/Bao */
  formatNum(v: number): string {
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(v);
  }

  fmtDate(d?: string | null): string {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('vi-VN');
  }

  fmtDateTime(d?: string | null): string {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  private async toast(message: string, color: string = 'success', duration = 1800) {
    const t = await this.toastCtrl.create({ message, duration, color, position: 'bottom' });
    await t.present();
  }
}

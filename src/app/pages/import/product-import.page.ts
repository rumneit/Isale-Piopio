import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cloudUploadOutline, cubeOutline, downloadOutline, homeOutline, warningOutline } from 'ionicons/icons';
import { Product } from '../../core/models/models';
import { ExcelCell, ExcelIoService } from '../../core/services/excel-io.service';
import { ProductsService } from '../../core/services/products.service';

interface ProductImportRow {
  sourceRow: number;
  sku: string;
  name: string;
  unit: string;
  price: number;
  cost: number | null;
  stock: number;
  categoryId: string | null;
  category: string;
  barcode: string | null;
  expiryDate: string | null;
  active: boolean;
  errors: string[];
  warnings: string[];
}

@Component({
  selector: 'app-product-import',
  templateUrl: './product-import.page.html',
  styleUrls: ['./excel-import.page.scss'],
  imports: [CommonModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonButton, IonIcon, IonTitle, IonContent, IonSpinner],
})
export class ProductImportPage {
  private readonly router = inject(Router);
  private readonly excel = inject(ExcelIoService);
  private readonly products = inject(ProductsService);
  private readonly toastCtrl = inject(ToastController);

  readonly fileName = signal('');
  readonly rows = signal<ProductImportRow[]>([]);
  readonly reading = signal(false);
  readonly importing = signal(false);
  readonly pageError = signal('');

  get invalidCount(): number { return this.rows().filter((row) => row.errors.length > 0).length; }
  get validCount(): number { return this.rows().length - this.invalidCount; }

  constructor() {
    addIcons({ cloudUploadOutline, cubeOutline, downloadOutline, homeOutline, warningOutline });
  }

  openHome(): void { void this.router.navigateByUrl('/home'); }

  async onFileInput(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.readFile(file);
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) await this.readFile(file);
  }

  private async readFile(file: File): Promise<void> {
    this.reading.set(true);
    this.pageError.set('');
    this.rows.set([]);
    this.fileName.set(file.name);
    try {
      const parsed = await this.excel.read(file);
      const headerRow = this.excel.findHeaderRow(parsed.rows, [
        ['Mã SP', 'SKU'], ['Tên SP', 'Tên sản phẩm'], ['Đơn vị'], ['Đơn giá', 'Giá bán'],
      ]);
      if (headerRow < 0) throw new Error('Không tìm thấy đủ cột bắt buộc: Mã SP, Tên SP, Đơn vị, Đơn giá.');
      this.rows.set(await this.parseRows(parsed.rows, headerRow));
      if (!this.rows().length) throw new Error('File không có dòng sản phẩm nào.');
    } catch (error: any) {
      this.pageError.set(error?.message ?? 'Không đọc được file Excel.');
    } finally {
      this.reading.set(false);
    }
  }

  private async parseRows(rawRows: ExcelCell[][], headerRow: number): Promise<ProductImportRow[]> {
    const headers = rawRows[headerRow];
    const col = (aliases: string[]) => this.excel.headerIndex(headers, aliases);
    const indexes = {
      sku: col(['Mã SP', 'SKU', 'Mã sản phẩm']),
      name: col(['Tên SP', 'Tên sản phẩm']),
      unit: col(['Đơn vị', 'ĐVT']),
      price: col(['Đơn giá', 'Giá bán']),
      cost: col(['Giá nhập', 'Giá vốn']),
      stock: col(['Tồn kho', 'Số lượng']),
      category: col(['Danh mục', 'Nhóm hàng']),
      barcode: col(['Mã vạch', 'Barcode']),
      expiry: col(['Hạn sử dụng', 'Ngày hết hạn']),
      status: col(['Trạng thái']),
    };
    const [existing, categories] = await Promise.all([this.products.list(), this.products.listCategories()]);
    const existingSkus = new Set(existing.map((item) => this.key(item.sku ?? '')).filter(Boolean));
    const categoryMap = new Map(categories.map((item) => [this.key(item.name), item.id]));
    const seen = new Set<string>();
    const result: ProductImportRow[] = [];

    for (let rowIndex = headerRow + 1; rowIndex < rawRows.length; rowIndex++) {
      const source = rawRows[rowIndex];
      if (!source.some((cell) => this.excel.text(cell))) continue;
      const sku = this.excel.text(source[indexes.sku]);
      const name = this.excel.text(source[indexes.name]);
      const unit = this.excel.text(source[indexes.unit]);
      const price = this.excel.number(source[indexes.price]);
      const cost = indexes.cost >= 0 ? this.excel.number(source[indexes.cost]) : null;
      const stock = indexes.stock >= 0 ? this.excel.number(source[indexes.stock]) : 0;
      const category = indexes.category >= 0 ? this.excel.text(source[indexes.category]) : '';
      const categoryId = category ? categoryMap.get(this.key(category)) ?? null : null;
      const errors: string[] = [];
      const warnings: string[] = [];
      const skuKey = this.key(sku);
      if (!sku) errors.push('Thiếu Mã SP');
      if (!name) errors.push('Thiếu Tên SP');
      if (!unit) errors.push('Thiếu Đơn vị');
      if (price == null || price < 0) errors.push('Đơn giá không hợp lệ');
      if (cost != null && cost < 0) errors.push('Giá nhập không hợp lệ');
      if (stock == null || stock < 0) errors.push('Tồn kho không hợp lệ');
      if (skuKey && seen.has(skuKey)) errors.push('Mã SP bị trùng trong file');
      if (skuKey && existingSkus.has(skuKey)) errors.push('Mã SP đã tồn tại trong hệ thống');
      if (category && !categoryId) warnings.push(`Không tìm thấy danh mục “${category}”`);
      if (skuKey) seen.add(skuKey);
      const status = indexes.status >= 0 ? this.key(this.excel.text(source[indexes.status])) : '';
      result.push({
        sourceRow: rowIndex + 1,
        sku,
        name,
        unit,
        price: price ?? 0,
        cost,
        stock: stock ?? 0,
        category,
        categoryId,
        barcode: indexes.barcode >= 0 ? this.excel.text(source[indexes.barcode]) || null : null,
        expiryDate: indexes.expiry >= 0 ? this.excel.date(source[indexes.expiry]) : null,
        active: !['ngung ban', 'inactive', '0', 'false'].includes(status),
        errors,
        warnings,
      });
    }
    return result;
  }

  async importRows(): Promise<void> {
    if (!this.rows().length || this.invalidCount > 0 || this.importing()) return;
    this.importing.set(true);
    this.pageError.set('');
    try {
      const payload: Partial<Product>[] = this.rows().map((row) => ({
        sku: row.sku,
        name: row.name,
        unit: row.unit,
        price: row.price,
        cost: row.cost,
        stock: row.stock,
        category_id: row.categoryId,
        barcode: row.barcode,
        expiry_date: row.expiryDate,
        active: row.active,
      }));
      const created = await this.products.createMany(payload);
      await this.toast(`Đã nhập thành công ${created.length} sản phẩm.`, 'success');
      this.rows.set([]);
      this.fileName.set('');
      void this.router.navigateByUrl('/product');
    } catch (error: any) {
      this.pageError.set(error?.message ?? 'Nhập sản phẩm thất bại. Không có dữ liệu nào được ghi.');
    } finally {
      this.importing.set(false);
    }
  }

  private key(value: string): string {
    return this.excel.normalizeHeader(value);
  }

  private async toast(message: string, color: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, color, duration: 2400, position: 'bottom' });
    await toast.present();
  }
}

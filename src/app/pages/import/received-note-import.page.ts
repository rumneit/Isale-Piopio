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
import { cloudUploadOutline, downloadOutline, homeOutline, readerOutline, warningOutline } from 'ionicons/icons';
import { ExcelCell, ExcelIoService } from '../../core/services/excel-io.service';
import { ProductsService } from '../../core/services/products.service';
import { ReceivedNoteItem, ReceivedNotesService } from '../../core/services/received-notes.service';

interface ReceivedImportRow {
  sourceRow: number;
  productId: string | null;
  sku: string;
  name: string;
  unit: string;
  cost: number;
  qty: number;
  amount: number;
  paidAmount: number;
  errors: string[];
}

@Component({
  selector: 'app-received-note-import',
  templateUrl: './received-note-import.page.html',
  styleUrls: ['./excel-import.page.scss'],
  imports: [CommonModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonButton, IonIcon, IonTitle, IonContent, IonSpinner],
})
export class ReceivedNoteImportPage {
  private readonly router = inject(Router);
  private readonly excel = inject(ExcelIoService);
  private readonly products = inject(ProductsService);
  private readonly notes = inject(ReceivedNotesService);
  private readonly toastCtrl = inject(ToastController);

  readonly fileName = signal('');
  readonly rows = signal<ReceivedImportRow[]>([]);
  readonly reading = signal(false);
  readonly importing = signal(false);
  readonly pageError = signal('');

  get invalidCount(): number { return this.rows().filter((row) => row.errors.length > 0).length; }
  get total(): number { return this.rows().reduce((sum, row) => sum + row.amount, 0); }
  get paidAmount(): number { return this.rows().find((row) => row.paidAmount >= 0)?.paidAmount ?? 0; }

  constructor() {
    addIcons({ cloudUploadOutline, downloadOutline, homeOutline, readerOutline, warningOutline });
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
        ['Tổng thanh toán'], ['Mã SP', 'SKU'], ['Tên SP'], ['Đơn vị'], ['Đơn giá'], ['Số lượng'], ['Thành tiền'],
      ]);
      if (headerRow < 0) {
        throw new Error('File thiếu cột bắt buộc. Hãy tải lại file mẫu và giữ nguyên tên các cột.');
      }
      this.rows.set(await this.parseRows(parsed.rows, headerRow));
      if (!this.rows().length) throw new Error('File không có dòng sản phẩm nào.');
    } catch (error: any) {
      this.pageError.set(error?.message ?? 'Không đọc được file Excel.');
    } finally {
      this.reading.set(false);
    }
  }

  private async parseRows(rawRows: ExcelCell[][], headerRow: number): Promise<ReceivedImportRow[]> {
    const headers = rawRows[headerRow];
    const col = (aliases: string[]) => this.excel.headerIndex(headers, aliases);
    const indexes = {
      paid: col(['Tổng thanh toán', 'Đã thanh toán']),
      sku: col(['Mã SP', 'SKU', 'Mã sản phẩm']),
      name: col(['Tên SP', 'Tên sản phẩm']),
      unit: col(['Đơn vị', 'ĐVT']),
      cost: col(['Đơn giá', 'Giá nhập']),
      qty: col(['Số lượng', 'SL']),
      amount: col(['Thành tiền', 'Tổng tiền']),
    };
    const existing = await this.products.list();
    const productMap = new Map(existing.map((product) => [this.key(product.sku ?? ''), product]));
    const seen = new Set<string>();
    const result: ReceivedImportRow[] = [];
    let canonicalPaid: number | null = null;

    for (let rowIndex = headerRow + 1; rowIndex < rawRows.length; rowIndex++) {
      const source = rawRows[rowIndex];
      if (!source.some((cell) => this.excel.text(cell))) continue;
      const sku = this.excel.text(source[indexes.sku]);
      const name = this.excel.text(source[indexes.name]);
      const unit = this.excel.text(source[indexes.unit]);
      const cost = this.excel.number(source[indexes.cost]);
      const qty = this.excel.number(source[indexes.qty]);
      const amount = this.excel.number(source[indexes.amount]);
      const paid = this.excel.number(source[indexes.paid]);
      if (canonicalPaid == null && paid != null) canonicalPaid = paid;
      const product = productMap.get(this.key(sku));
      const errors: string[] = [];
      if (!sku) errors.push('Thiếu Mã SP');
      if (!name) errors.push('Thiếu Tên SP');
      if (!unit) errors.push('Thiếu Đơn vị');
      if (cost == null || cost < 0) errors.push('Đơn giá không hợp lệ');
      if (qty == null || qty <= 0) errors.push('Số lượng phải lớn hơn 0');
      if (amount == null || amount < 0) errors.push('Thành tiền không hợp lệ');
      if (paid == null || paid < 0) errors.push('Tổng thanh toán không hợp lệ');
      if (paid != null && canonicalPaid != null && Math.abs(paid - canonicalPaid) > 0.01) errors.push('Tổng thanh toán không thống nhất');
      if (cost != null && qty != null && amount != null && Math.abs(cost * qty - amount) > 1) errors.push('Thành tiền khác Đơn giá × Số lượng');
      if (sku && !product) errors.push('Mã SP chưa tồn tại trong hệ thống');
      const skuKey = this.key(sku);
      if (skuKey && seen.has(skuKey)) errors.push('Mã SP bị trùng trong phiếu');
      if (skuKey) seen.add(skuKey);
      result.push({
        sourceRow: rowIndex + 1,
        productId: product?.id ?? null,
        sku,
        name,
        unit,
        cost: cost ?? 0,
        qty: qty ?? 0,
        amount: amount ?? 0,
        paidAmount: paid ?? -1,
        errors,
      });
    }

    const total = result.reduce((sum, row) => sum + row.amount, 0);
    if (canonicalPaid != null && canonicalPaid > total + 1) {
      for (const row of result) row.errors.push('Tổng thanh toán lớn hơn giá trị phiếu');
    }
    return result;
  }

  async importNote(): Promise<void> {
    if (!this.rows().length || this.invalidCount || this.importing()) return;
    this.importing.set(true);
    this.pageError.set('');
    try {
      const items: ReceivedNoteItem[] = this.rows().map((row) => ({
        product_id: row.productId,
        name: row.name,
        qty: row.qty,
        cost: row.cost,
      }));
      const paidAmount = Math.min(this.paidAmount, this.total);
      const note = await this.notes.create({
        supplier_name: null,
        paid: paidAmount >= this.total,
        paid_amount: paidAmount,
        note: `Nhập từ Excel: ${this.fileName()}`,
      }, items);
      await this.toast(`Đã tạo phiếu ${note.code} với ${items.length} sản phẩm.`, 'success');
      this.rows.set([]);
      this.fileName.set('');
      void this.router.navigateByUrl('/received-note');
    } catch (error: any) {
      this.pageError.set(error?.message ?? 'Nhập phiếu thất bại.');
    } finally {
      this.importing.set(false);
    }
  }

  private key(value: string): string { return this.excel.normalizeHeader(value); }

  private async toast(message: string, color: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, color, duration: 2600, position: 'bottom' });
    await toast.present();
  }
}

import { Injectable, inject } from '@angular/core';
import { ExcelCell, ExcelIoService } from './excel-io.service';
import { ProductsService } from './products.service';

@Injectable({ providedIn: 'root' })
export class ProductExcelService {
  private readonly excel = inject(ExcelIoService);
  private readonly products = inject(ProductsService);

  async export(search = '', ids?: Set<string>): Promise<number> {
    const [products, categories] = await Promise.all([
      this.products.list(search),
      this.products.listCategories(),
    ]);
    const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
    const selected = ids?.size ? products.filter((product) => ids.has(product.id)) : products;
    const rows: ExcelCell[][] = [
      ['Mã SP', 'Tên SP', 'Đơn vị', 'Đơn giá', 'Giá nhập', 'Tồn kho', 'Danh mục', 'Mã vạch', 'Hạn sử dụng', 'Trạng thái', 'Ngày tạo'],
      ...selected.map((product) => [
        product.sku ?? '',
        product.name,
        product.unit ?? '',
        Number(product.price ?? 0),
        product.cost == null ? null : Number(product.cost),
        Number(product.stock ?? 0),
        product.category_id ? categoryMap.get(product.category_id) ?? '' : '',
        product.barcode ?? '',
        product.expiry_date ?? '',
        product.active ? 'Đang bán' : 'Ngừng bán',
        product.created_at ? new Date(product.created_at) : null,
      ]),
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    this.excel.download(`san-pham-${stamp}.xlsx`, 'Sản phẩm', rows);
    return selected.length;
  }
}

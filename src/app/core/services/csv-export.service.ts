import { Injectable } from '@angular/core';

/** Escape 1 ô CSV + vô hiệu hóa công thức Excel (CSV injection). */
export function escapeCsvCell(v: string | number | null | undefined): string {
  let s = v == null ? '' : String(v);
  // Tên khách/sản phẩm do người dùng nhập có thể bắt đầu bằng =, +, -, @ và bị
  // Excel thực thi như công thức khi mở file xuất ra.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

@Injectable({ providedIn: 'root' })
export class CsvExportService {
  /**
   * Xuất mảng dữ liệu ra file CSV (có BOM để Excel đọc đúng tiếng Việt)
   * rồi tải về máy.
   */
  export(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
    const lines = [headers.map(escapeCsvCell).join(',')];
    for (const row of rows) {
      lines.push(row.map(escapeCsvCell).join(','));
    }

    // \uFEFF = BOM để Excel nhận diện UTF-8
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  formatMoney(v: number | null | undefined): string {
    return String(Math.round(v ?? 0));
  }

  formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
}

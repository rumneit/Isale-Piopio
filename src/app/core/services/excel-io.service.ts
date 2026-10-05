import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';

export type ExcelCell = string | number | boolean | Date | null;

export interface ParsedExcelSheet {
  name: string;
  rows: ExcelCell[][];
}

@Injectable({ providedIn: 'root' })
export class ExcelIoService {
  readonly acceptedExtensions = ['xlsx', 'xls', 'csv'];

  async read(file: File): Promise<ParsedExcelSheet> {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!this.acceptedExtensions.includes(extension)) {
      throw new Error('Chỉ hỗ trợ file .xlsx, .xls hoặc .csv.');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('File vượt quá 10 MB. Hãy chia nhỏ dữ liệu rồi thử lại.');
    }
    // SheetJS guesses legacy code pages when CSV bytes are read as an
    // ArrayBuffer. Reading CSV as text keeps UTF-8 Vietnamese headers intact.
    const workbook = extension === 'csv'
      ? XLSX.read((await file.text()).replace(/^\uFEFF/, ''), {
          type: 'string',
          cellDates: true,
          dense: true,
        })
      : XLSX.read(await file.arrayBuffer(), {
          type: 'array',
          cellDates: true,
          dense: true,
        });
    const name = workbook.SheetNames[0];
    if (!name) throw new Error('File không có trang tính nào.');
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<ExcelCell[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });
    return { name, rows };
  }

  download(filename: string, sheetName: string, rows: ExcelCell[][]): void {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31));
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true });
    const url = URL.createObjectURL(new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  normalizeHeader(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  findHeaderRow(rows: ExcelCell[][], requiredAliases: string[][]): number {
    const limit = Math.min(rows.length, 30);
    for (let rowIndex = 0; rowIndex < limit; rowIndex++) {
      const normalized = rows[rowIndex].map((cell) => this.normalizeHeader(cell));
      const matches = requiredAliases.filter((aliases) =>
        aliases.some((alias) => normalized.includes(this.normalizeHeader(alias)))
      ).length;
      if (matches === requiredAliases.length) return rowIndex;
    }
    return -1;
  }

  headerIndex(headers: ExcelCell[], aliases: string[]): number {
    const normalized = headers.map((cell) => this.normalizeHeader(cell));
    return normalized.findIndex((value) => aliases.some((alias) => value === this.normalizeHeader(alias)));
  }

  text(value: unknown): string {
    return String(value ?? '').trim();
  }

  number(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const text = String(value ?? '').trim();
    if (!text) return null;
    const cleaned = text.replace(/\s|₫|đ/gi, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  date(value: unknown): string | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number') {
      const decoded = XLSX.SSF.parse_date_code(value);
      if (decoded) return `${decoded.y}-${String(decoded.m).padStart(2, '0')}-${String(decoded.d).padStart(2, '0')}`;
    }
    const text = String(value ?? '').trim();
    if (!text) return null;
    const match = text.match(/^(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,4})$/);
    if (!match) return null;
    const first = Number(match[1]);
    const second = Number(match[2]);
    const third = Number(match[3]);
    const [year, month, day] = first > 31 ? [first, second, third] : [third, second, first];
    if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
}

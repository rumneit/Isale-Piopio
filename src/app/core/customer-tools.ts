import { ExcelCell } from './services/excel-io.service';

export type CustomerImportField = 'name' | 'code' | 'phone' | 'email' | 'address' | 'gender' | 'dob' | 'important';
export interface CustomerImportRow {
  rowNumber: number;
  name: string;
  code?: string;
  phone?: string;
  email?: string;
  address?: string;
  gender?: string;
  dob?: string;
  important?: boolean;
}
export interface CustomerImportError { row: number; field: CustomerImportField | 'file'; message: string; }

export const CUSTOMER_IMPORT_FIELDS: Array<{ key: CustomerImportField; label: string; aliases: string[] }> = [
  { key: 'name', label: 'Họ tên *', aliases: ['họ tên', 'ho ten', 'tên khách hàng', 'name', 'full name', 'fullname'] },
  { key: 'code', label: 'Mã khách hàng', aliases: ['mã khách hàng', 'ma khach hang', 'mã kh', 'code'] },
  { key: 'phone', label: 'Điện thoại', aliases: ['điện thoại', 'dien thoai', 'sđt', 'sdt', 'phone', 'mobile'] },
  { key: 'email', label: 'Email', aliases: ['email', 'e-mail'] },
  { key: 'address', label: 'Địa chỉ', aliases: ['địa chỉ', 'dia chi', 'address'] },
  { key: 'gender', label: 'Giới tính', aliases: ['giới tính', 'gioi tinh', 'gender'] },
  { key: 'dob', label: 'Ngày sinh', aliases: ['ngày sinh', 'ngay sinh', 'dob', 'birthday'] },
  { key: 'important', label: 'Quan trọng', aliases: ['quan trọng', 'quan trong', 'important', 'vip'] },
];

export function normalizeHeading(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function autoMapCustomerHeaders(headers: ExcelCell[]): Record<CustomerImportField, number> {
  const normalized = headers.map(normalizeHeading);
  return Object.fromEntries(CUSTOMER_IMPORT_FIELDS.map((field) => [
    field.key,
    normalized.findIndex((header) => field.aliases.some((alias) => header === normalizeHeading(alias))),
  ])) as Record<CustomerImportField, number>;
}

export function normalizePhoneInput(value: unknown): string {
  let raw = String(value ?? '').trim();
  if (/^\d+(?:\.0+)?$/.test(raw)) raw = raw.replace(/\.0+$/, '');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('84') && digits.length >= 10) return `0${digits.slice(2)}`;
  if (digits.length === 9 && /^[35789]/.test(digits)) return `0${digits}`;
  return digits;
}

export function parseCustomerRows(
  rows: ExcelCell[][],
  headerRow: number,
  mapping: Record<CustomerImportField, number>,
  parseDate: (value: unknown) => string | null,
): { rows: CustomerImportRow[]; errors: CustomerImportError[] } {
  const parsed: CustomerImportRow[] = [];
  const errors: CustomerImportError[] = [];
  const seen = new Map<string, number>();
  for (let index = headerRow + 1; index < rows.length; index++) {
    const source = rows[index];
    if (!source?.some((cell) => String(cell ?? '').trim())) continue;
    const get = (field: CustomerImportField) => mapping[field] >= 0 ? source[mapping[field]] : null;
    const name = String(get('name') ?? '').trim();
    const phone = normalizePhoneInput(get('phone'));
    const email = String(get('email') ?? '').trim().toLowerCase();
    const rowNumber = index + 1;
    if (name.length < 2) errors.push({ row: rowNumber, field: 'name', message: 'Họ tên phải có ít nhất 2 ký tự.' });
    if (phone && (phone.length < 8 || phone.length > 15)) errors.push({ row: rowNumber, field: 'phone', message: 'Số điện thoại phải có 8–15 chữ số.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push({ row: rowNumber, field: 'email', message: 'Email không hợp lệ.' });
    const dobRaw = get('dob');
    const dob = dobRaw == null || String(dobRaw).trim() === '' ? null : parseDate(dobRaw);
    if (dobRaw != null && String(dobRaw).trim() && !dob) errors.push({ row: rowNumber, field: 'dob', message: 'Ngày sinh không hợp lệ.' });
    const code = String(get('code') ?? '').trim();
    const duplicateKeys: Array<{ key:string; field:CustomerImportField }> = [
      ...(phone ? [{ key:`phone:${phone}`, field:'phone' as CustomerImportField }] : []),
      ...(email ? [{ key:`email:${email}`, field:'email' as CustomerImportField }] : []),
      ...(code ? [{ key:`code:${code.toLocaleLowerCase('vi')}`, field:'code' as CustomerImportField }] : []),
    ];
    for (const duplicate of duplicateKeys) {
      if (seen.has(duplicate.key)) errors.push({ row: rowNumber, field: duplicate.field, message: `Trùng với dòng ${seen.get(duplicate.key)} trong file.` });
      else seen.set(duplicate.key, rowNumber);
    }
    if (errors.some((error) => error.row === rowNumber)) continue;
    parsed.push({
      rowNumber, name,
      code: code || undefined,
      phone: phone || undefined, email: email || undefined,
      address: String(get('address') ?? '').trim() || undefined,
      gender: String(get('gender') ?? '').trim() || undefined,
      dob: dob || undefined,
      important: /^(1|true|yes|co|có|vip|x)$/i.test(String(get('important') ?? '').trim()),
    });
  }
  return { rows: parsed, errors };
}

export interface ContactCandidate { name: string; phone?: string; phones?: string[]; email?: string; selected: boolean; }
export function parseVCard(text: string): ContactCandidate[] {
  return text.split(/END:VCARD/i).map((block) => {
    const unfolded = block.replace(/\r?\n[ \t]/g, '');
    const name = (unfolded.match(/^FN(?:;[^:]*)?:(.+)$/im)?.[1] ?? '').trim();
    const phones = [...unfolded.matchAll(/^TEL(?:;[^:]*)?:(.+)$/gim)].map((match) => normalizePhoneInput(match[1])).filter(Boolean);
    const phone = phones[0] ?? '';
    const email = (unfolded.match(/^EMAIL(?:;[^:]*)?:(.+)$/im)?.[1] ?? '').trim().toLowerCase();
    return { name, phone: phone || undefined, phones, email: email || undefined, selected: true };
  }).filter((contact) => contact.name.length >= 2 && !!(contact.phone || contact.email));
}

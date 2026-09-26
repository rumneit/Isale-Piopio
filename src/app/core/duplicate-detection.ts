/**
 * Phát hiện khách hàng trùng lặp.
 *
 * Thuần logic (không phụ thuộc Supabase) để dễ kiểm thử.
 * Quy tắc:
 *  - Chuẩn hoá SĐT: bỏ mọi ký tự không phải số, bỏ tiền tố 84 / +84 / 0.
 *  - Chuẩn hoá tên: bỏ dấu, viết thường, gộp khoảng trắng.
 *  - Hai khách bị coi là trùng nếu: cùng SĐT chuẩn hoá, HOẶC cùng tên chuẩn hoá
 *    và có ít nhất một điểm chung khác (email/địa chỉ).
 */

export interface DuplicateCandidate {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

export interface DuplicateGroup {
  key: string;
  reason: 'phone' | 'name';
  items: DuplicateCandidate[];
}

export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length > 9) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length > 9) digits = digits.slice(1);
  return digits;
}

export function normalizeName(name: string | null | undefined): string {
  if (!name) return '';
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/** Tìm các nhóm khách trùng lặp trong danh sách. */
export function findDuplicates(customers: DuplicateCandidate[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const byPhone = new Map<string, DuplicateCandidate[]>();
  const byName = new Map<string, DuplicateCandidate[]>();

  for (const c of customers) {
    const p = normalizePhone(c.phone);
    if (p.length >= 7) {
      const arr = byPhone.get(p) ?? [];
      arr.push(c);
      byPhone.set(p, arr);
    }
    const n = normalizeName(c.name);
    if (n) {
      const arr = byName.get(n) ?? [];
      arr.push(c);
      byName.set(n, arr);
    }
  }

  for (const [key, items] of byPhone) {
    if (items.length > 1) groups.push({ key, reason: 'phone', items });
  }
  for (const [key, items] of byName) {
    if (items.length > 1) {
      // Chỉ tính là trùng theo tên nếu có thêm điểm chung (email/địa chỉ)
      const sharesMore = items.some((a, i) =>
        items.some(
          (b, j) =>
            i < j &&
            ((normalizeEmail(a.email) && normalizeEmail(a.email) === normalizeEmail(b.email)) ||
              (a.address && b.address && a.address.trim().toLowerCase() === b.address.trim().toLowerCase()))
        )
      );
      if (sharesMore) groups.push({ key, reason: 'name', items });
    }
  }

  // Loại nhóm trùng hoàn toàn theo SĐT khỏi nhóm tên (đã bắt ở byPhone)
  const phoneIds = new Set(groups.filter((g) => g.reason === 'phone').flatMap((g) => g.items.map((i) => i.id)));
  return groups.filter(
    (g) => g.reason === 'phone' || !g.items.every((i) => phoneIds.has(i.id))
  );
}

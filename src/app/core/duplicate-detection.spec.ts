import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  normalizeName,
  findDuplicates,
  DuplicateCandidate,
} from './duplicate-detection';

function c(partial: Partial<DuplicateCandidate> & { id: string; name: string }): DuplicateCandidate {
  return {
    phone: null,
    email: null,
    address: null,
    ...partial,
  };
}

describe('duplicate-detection', () => {
  it('chuẩn hoá số điện thoại (bỏ +84/84/0 và ký tự lạ)', () => {
    expect(normalizePhone('+84 912-345-678')).toBe('912345678');
    expect(normalizePhone('0912345678')).toBe('912345678');
    expect(normalizePhone('84912345678')).toBe('912345678');
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone('abc')).toBe('');
  });

  it('chuẩn hoá tên (bỏ dấu, thường hoá, gộp khoảng trắng)', () => {
    expect(normalizeName('  Nguyễn   Văn  A ')).toBe('nguyen van a');
    expect(normalizeName('Đặng Thị Đào')).toBe('dang thi dao');
    expect(normalizeName(null)).toBe('');
  });

  it('phát hiện trùng theo số điện thoại', () => {
    const groups = findDuplicates([
      c({ id: '1', name: 'A', phone: '0912345678' }),
      c({ id: '2', name: 'B', phone: '+84 912 345 678' }),
      c({ id: '3', name: 'C', phone: '0987654321' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe('phone');
    expect(groups[0].items.map((i) => i.id).sort()).toEqual(['1', '2']);
  });

  it('phát hiện trùng theo tên khi có thêm email/địa chỉ chung', () => {
    const groups = findDuplicates([
      c({ id: '1', name: 'Nguyễn Văn A', email: 'a@x.com' }),
      c({ id: '2', name: 'nguyen van a', email: 'A@X.com' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe('name');
  });

  it('KHÔNG coi trùng khi chỉ trùng tên mà không có thông tin chung', () => {
    const groups = findDuplicates([
      c({ id: '1', name: 'Nguyễn Văn A', phone: '0900000001' }),
      c({ id: '2', name: 'Nguyễn Văn A', phone: '0900000002' }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it('bỏ qua số điện thoại quá ngắn', () => {
    const groups = findDuplicates([
      c({ id: '1', name: 'A', phone: '123' }),
      c({ id: '2', name: 'B', phone: '123' }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it('trả về mảng rỗng khi không có khách trùng', () => {
    expect(findDuplicates([])).toEqual([]);
    expect(
      findDuplicates([c({ id: '1', name: 'A', phone: '0900000001' })])
    ).toEqual([]);
  });
});

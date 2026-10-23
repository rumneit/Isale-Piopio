import { describe, it, expect } from 'vitest';
import { newDocumentCode } from './document-code';

describe('newDocumentCode', () => {
  it('đúng định dạng PREFIX-YYMMDD-8HEX', () => {
    const code = newDocumentCode('DH', new Date(2026, 9, 23));
    expect(code).toMatch(/^DH-261023-[0-9A-F]{8}$/);
  });

  it('hỗ trợ đủ 3 loại chứng từ', () => {
    expect(newDocumentCode('PN', new Date(2026, 0, 2))).toMatch(/^PN-260102-[0-9A-F]{8}$/);
    expect(newDocumentCode('TH', new Date(2026, 11, 31))).toMatch(/^TH-261231-[0-9A-F]{8}$/);
  });

  it('không trùng trong 5.000 mã liên tiếp', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 5000; i++) codes.add(newDocumentCode('DH'));
    expect(codes.size).toBe(5000);
  });
});

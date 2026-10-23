import { describe, it, expect } from 'vitest';
import { escapeCsvCell } from './csv-export.service';

describe('escapeCsvCell', () => {
  it('escape dấu phẩy, nháy kép và xuống dòng', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('a"b')).toBe('"a""b"');
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"');
  });

  it('vô hiệu hóa công thức Excel (CSV injection)', () => {
    expect(escapeCsvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(escapeCsvCell('+84901234567')).toBe("'+84901234567");
    expect(escapeCsvCell('-1+2')).toBe("'-1+2");
    expect(escapeCsvCell('@cmd')).toBe("'@cmd");
  });

  it('không đổi số và chuỗi bình thường', () => {
    expect(escapeCsvCell(123)).toBe('123');
    expect(escapeCsvCell('Nguyễn Văn A')).toBe('Nguyễn Văn A');
    expect(escapeCsvCell(null)).toBe('');
  });
});

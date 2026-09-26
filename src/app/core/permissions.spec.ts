import { describe, it, expect } from 'vitest';
import {
  PERMISSION_DEFS,
  ROLES,
  permissionForRoute,
  presetsForRole,
  roleLabel,
} from './permissions';

describe('permissions (RBAC)', () => {
  it('định nghĩa đủ 5 quyền gốc', () => {
    expect(PERMISSION_DEFS.map((p) => p.key)).toEqual([
      'sell',
      'inventory',
      'money',
      'report',
      'crm',
    ]);
  });

  it('ánh xạ route -> quyền theo phân đoạn đầu', () => {
    expect(permissionForRoute('/product')).toBe('inventory');
    expect(permissionForRoute('/product/add')).toBe('inventory');
    expect(permissionForRoute('/stock-check/new')).toBe('inventory');
    expect(permissionForRoute('/received-note/add')).toBe('inventory');
    expect(permissionForRoute('/order')).toBe('sell');
    expect(permissionForRoute('/money-account')).toBe('money');
    expect(permissionForRoute('/report/stock')).toBe('report');
    expect(permissionForRoute('/crm/pipeline')).toBe('crm');
  });

  it('trả về null cho route không yêu cầu quyền', () => {
    expect(permissionForRoute('/home')).toBeNull();
    expect(permissionForRoute('/staff')).toBeNull();
    expect(permissionForRoute('/config')).toBeNull();
    expect(permissionForRoute('')).toBeNull();
    expect(permissionForRoute(null)).toBeNull();
  });

  it('preset quyền: chủ cửa hàng toàn quyền', () => {
    const p = presetsForRole('owner');
    expect(p).toEqual({ sell: true, inventory: true, money: true, report: true, crm: true });
  });

  it('preset quyền: kế toán có tiền + báo cáo, không có kho', () => {
    const p = presetsForRole('accountant');
    expect(p['money']).toBe(true);
    expect(p['report']).toBe(true);
    expect(p['inventory']).toBe(false);
  });

  it('preset quyền: picker có kho, không có tiền/báo cáo', () => {
    const p = presetsForRole('picker');
    expect(p['inventory']).toBe(true);
    expect(p['money']).toBe(false);
    expect(p['report']).toBe(false);
  });

  it('preset trả bản sao, không sửa được preset gốc', () => {
    const a = presetsForRole('staff');
    a['sell'] = false;
    const b = presetsForRole('staff');
    expect(b['sell']).toBe(true);
  });

  it('vai trò lạ dùng nhãn mặc định', () => {
    expect(roleLabel('khong-ton-tai')).toBe('Nhân viên');
    expect(roleLabel(null)).toBe('Nhân viên');
    expect(roleLabel('manager')).toBe('Quản lý kho');
  });

  it('mọi vai trò đều có preset cho các quyền đã định nghĩa', () => {
    for (const r of ROLES) {
      for (const d of PERMISSION_DEFS) {
        expect(typeof r.presets[d.key]).toBe('boolean');
      }
    }
  });
});

/**
 * Nguồn duy nhất định nghĩa quyền (RBAC) cho toàn app.
 *
 * - PERMISSION_DEFS: các quyền được bật/tắt cho từng nhân viên (lưu ở profiles.permissions).
 * - ROLE_PRESETS: preset quyền theo vai trò chuẩn của kho.
 * - can(): owner luôn toàn quyền; nhân viên theo cờ đã lưu.
 *
 * Lưu ý an toàn: khi CHƯA xác định được hồ sơ (profile = null, ví dụ đang tải hoặc
 * môi trường test), can() trả về true để tránh khoá nhầm người dùng hợp lệ.
 */

export interface PermissionDef {
  key: string;
  label: string;
}

/** Các quyền có thể bật/tắt cho nhân viên. Giữ nguyên 5 khoá gốc để tương thích dữ liệu cũ. */
export const PERMISSION_DEFS: PermissionDef[] = [
  { key: 'sell', label: 'Bán hàng & Đơn hàng' },
  { key: 'inventory', label: 'Kho & Sản phẩm' },
  { key: 'money', label: 'Thu chi & Sổ tiền' },
  { key: 'report', label: 'Báo cáo' },
  { key: 'crm', label: 'CRM & Khách hàng' },
];

/** Vai trò chuẩn của hệ thống kho + preset quyền tương ứng. */
export interface RoleDef {
  value: string;
  label: string;
  presets: Record<string, boolean>;
}

export const ROLES: RoleDef[] = [
  {
    value: 'owner',
    label: 'Chủ cửa hàng (toàn quyền)',
    presets: { sell: true, inventory: true, money: true, report: true, crm: true },
  },
  {
    value: 'manager',
    label: 'Quản lý kho',
    presets: { sell: true, inventory: true, money: true, report: true, crm: true },
  },
  {
    value: 'picker',
    label: 'Nhân viên kho (Picker)',
    presets: { sell: true, inventory: true, money: false, report: false, crm: false },
  },
  {
    value: 'accountant',
    label: 'Kế toán',
    presets: { sell: true, inventory: false, money: true, report: true, crm: false },
  },
  {
    value: 'staff',
    label: 'Nhân viên',
    presets: { sell: true, inventory: true, money: false, report: false, crm: false },
  },
];

export function roleLabel(role: string | null | undefined): string {
  return ROLES.find((r) => r.value === role)?.label ?? 'Nhân viên';
}

/** Preset quyền mặc định cho một vai trò (dùng khi đổi vai trò nhân viên). */
export function presetsForRole(role: string | null | undefined): Record<string, boolean> {
  return { ...(ROLES.find((r) => r.value === role)?.presets ?? {}) };
}

/** Bản đồ route -> quyền cần có. Route không có trong map thì mọi người đều vào được. */
export const ROUTE_PERMISSIONS: Record<string, string> = {
  // Kho & sản phẩm
  product: 'inventory',
  'received-note': 'inventory',
  transfer: 'inventory',
  'stock-check': 'inventory',
  material: 'inventory',
  import: 'inventory',
  scan: 'inventory',
  // Bán hàng
  order: 'sell',
  sale: 'sell',
  returns: 'sell',
  'online-order': 'sell',
  'cafe-tables': 'sell',
  quote: 'sell',
  promotion: 'sell',
  delivery: 'sell',
  trade: 'sell',
  'sales-route': 'sell',
  'sales-channels': 'sell',
  // Tiền
  'money-account': 'money',
  debt: 'money',
  // CRM & khách hàng
  crm: 'crm',
  'crm-activities': 'crm',
  contact: 'crm',
  point: 'crm',
  note: 'crm',
  calendar: 'crm',
  'activity-log': 'crm',
  // Báo cáo
  report: 'report',
};

/** Lấy quyền cần có cho một route, dựa vào phân đoạn đầu tiên của đường dẫn. */
export function permissionForRoute(path: string | null | undefined): string | null {
  if (!path) return null;
  const seg = path.replace(/^\//, '').split('/')[0];
  return ROUTE_PERMISSIONS[seg] ?? null;
}

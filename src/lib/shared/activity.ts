import { fmtRupiah } from './format';

export const ACTIVITY_ACTIONS = [
  'LOGIN',
  'LOGOUT',
  'VISIT',
  'TX_CREATE',
  'TX_VOID',
  'STAFF_INVITE',
  'STAFF_DELETE',
  'STAFF_PASSWORD_RESET',
  'STAFF_JOIN',
  'STAFF_USERNAME_CHANGE',
  'INVITE_RESEND',
  'INVITE_REVOKE',
  'PRODUCT_CREATE',
  'PRODUCT_UPDATE',
  'PRODUCT_TOGGLE',
  'PRODUCT_DELETE',
  'DISCOUNT_CREATE',
  'DISCOUNT_UPDATE',
  'DISCOUNT_TOGGLE',
  'DISCOUNT_DELETE'
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];
export const isActivityAction = (v: unknown): v is ActivityAction =>
  typeof v === 'string' && (ACTIVITY_ACTIONS as readonly string[]).includes(v);

export const ACTIVITY_LABEL: Record<ActivityAction, string> = {
  LOGIN: 'Login',
  LOGOUT: 'Logout',
  VISIT: 'Kunjungan',
  TX_CREATE: 'Mencatat transaksi',
  TX_VOID: 'Void struk',
  STAFF_INVITE: 'Mengundang staff',
  STAFF_DELETE: 'Menghapus staff',
  STAFF_PASSWORD_RESET: 'Reset password staff',
  STAFF_JOIN: 'Staff bergabung',
  STAFF_USERNAME_CHANGE: 'Mengubah username staff',
  INVITE_RESEND: 'Mengirim ulang undangan',
  INVITE_REVOKE: 'Mencabut undangan',
  PRODUCT_CREATE: 'Menambah produk',
  PRODUCT_UPDATE: 'Mengubah produk',
  PRODUCT_TOGGLE: 'Mengubah status produk',
  PRODUCT_DELETE: 'Menghapus produk',
  DISCOUNT_CREATE: 'Menambah diskon',
  DISCOUNT_UPDATE: 'Mengubah diskon',
  DISCOUNT_TOGGLE: 'Mengubah status diskon',
  DISCOUNT_DELETE: 'Menghapus diskon'
};

export const ROLE_FILTERS = ['all', 'owner', 'staff'] as const;
export type RoleFilter = (typeof ROLE_FILTERS)[number];

export const ACTION_FILTERS = [
  { key: 'login', label: 'Login & kunjungan', actions: ['LOGIN', 'LOGOUT', 'VISIT'] },
  { key: 'transaksi', label: 'Transaksi', actions: ['TX_CREATE', 'TX_VOID'] },
  { key: 'void', label: 'Void', actions: ['TX_VOID'] },
  { key: 'produk', label: 'Produk', actions: ['PRODUCT_CREATE', 'PRODUCT_UPDATE', 'PRODUCT_TOGGLE', 'PRODUCT_DELETE'] },
  { key: 'diskon', label: 'Diskon', actions: ['DISCOUNT_CREATE', 'DISCOUNT_UPDATE', 'DISCOUNT_TOGGLE', 'DISCOUNT_DELETE'] },
  { key: 'staff', label: 'Kelola staff', actions: ['STAFF_INVITE', 'STAFF_DELETE', 'STAFF_PASSWORD_RESET', 'STAFF_JOIN', 'STAFF_USERNAME_CHANGE', 'INVITE_RESEND', 'INVITE_REVOKE'] }
] as const satisfies readonly { key: string; label: string; actions: readonly ActivityAction[] }[];

export type LoginMeta = { newDevice: boolean };
export type TxCreateMeta = { total: number; itemCount: number; qty: number };
export type TxVoidMeta = {
  total: number;
  itemCount: number;
  cashierName: string | null;
  txCreatedAt: string | null;
};
export type StaffMeta = { username: string | null; name: string | null };
export type UsernameChangeMeta = { username: string | null; oldUsername: string | null; name: string | null };
// fields hanya berisi nama field yang berubah agar meta ringan.
export type ProductMeta = {
  name: string | null;
  sellingPrice: number | null;
  costPrice: number | null;
  fields: string[] | null;
  isActive: boolean | null;
};
export type DiscountMeta = { name: string | null; percent: number | null; scope: string | null; isActive: boolean | null };

// Urutan browser di bawah menentukan hasil: UA Edge memuat token Chrome sehingga dicek duluan.
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Perangkat tidak dikenal';
  const browser = /EdgA\/|EdgiOS\/|Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /SamsungBrowser\//.test(ua)
        ? 'Samsung Internet'
        : /FxiOS\/|Firefox\//.test(ua)
          ? 'Firefox'
          : /CriOS\/|Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : null;
  if (!browser) return 'Perangkat tidak dikenal';
  // UA iOS memuat frasa Mac OS X sehingga iPhone/iPad dicek sebelum macOS.
  const os = /Windows NT/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /CrOS/.test(ua)
            ? 'ChromeOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
  return os ? `${browser} · ${os}` : browser;
}

function numOf(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function strOf(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function objOf(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
}

function boolOf(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function strListOf(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null;
}

export function parseMeta(action: 'LOGIN', raw: unknown): LoginMeta;
export function parseMeta(action: 'TX_CREATE', raw: unknown): TxCreateMeta;
export function parseMeta(action: 'TX_VOID', raw: unknown): TxVoidMeta;
export function parseMeta(action: 'STAFF_USERNAME_CHANGE', raw: unknown): UsernameChangeMeta;
export function parseMeta(action: 'PRODUCT_CREATE' | 'PRODUCT_UPDATE' | 'PRODUCT_TOGGLE' | 'PRODUCT_DELETE', raw: unknown): ProductMeta;
export function parseMeta(action: 'DISCOUNT_CREATE' | 'DISCOUNT_UPDATE' | 'DISCOUNT_TOGGLE' | 'DISCOUNT_DELETE', raw: unknown): DiscountMeta;
export function parseMeta(action: ActivityAction, raw: unknown): StaffMeta;
export function parseMeta(action: ActivityAction, raw: unknown): LoginMeta | TxCreateMeta | TxVoidMeta | StaffMeta | UsernameChangeMeta | ProductMeta | DiscountMeta {
  const m = objOf(raw);
  if (action === 'LOGIN') return { newDevice: m.newDevice === true };
  if (action === 'TX_CREATE')
    return { total: numOf(m.total) ?? 0, itemCount: numOf(m.itemCount) ?? 0, qty: numOf(m.qty) ?? 0 };
  if (action === 'TX_VOID')
    return {
      total: numOf(m.total) ?? 0,
      itemCount: numOf(m.itemCount) ?? 0,
      cashierName: strOf(m.cashierName),
      txCreatedAt: strOf(m.txCreatedAt)
    };
  if (action === 'STAFF_USERNAME_CHANGE')
    return { username: strOf(m.username), oldUsername: strOf(m.oldUsername), name: strOf(m.name) };
  if (action === 'PRODUCT_CREATE' || action === 'PRODUCT_UPDATE' || action === 'PRODUCT_TOGGLE' || action === 'PRODUCT_DELETE')
    return {
      name: strOf(m.name),
      sellingPrice: numOf(m.sellingPrice),
      costPrice: numOf(m.costPrice),
      fields: strListOf(m.fields),
      isActive: boolOf(m.isActive)
    };
  if (action === 'DISCOUNT_CREATE' || action === 'DISCOUNT_UPDATE' || action === 'DISCOUNT_TOGGLE' || action === 'DISCOUNT_DELETE')
    return { name: strOf(m.name), percent: numOf(m.percent), scope: strOf(m.scope), isActive: boolOf(m.isActive) };
  return { username: strOf(m.username), name: strOf(m.name) };
}

export function describeActivity(action: ActivityAction, meta: unknown): string {
  if (action === 'LOGIN' || action === 'LOGOUT' || action === 'VISIT') return '';
  if (action === 'TX_CREATE') {
    const t = parseMeta('TX_CREATE', meta);
    return `${fmtRupiah(t.total)} · ${t.itemCount} jenis, ${t.qty} item`;
  }
  if (action === 'TX_VOID') {
    const t = parseMeta('TX_VOID', meta);
    return `${fmtRupiah(t.total)} · kasir ${t.cashierName ?? '-'}`;
  }
  if (action === 'STAFF_USERNAME_CHANGE') {
    const s = parseMeta('STAFF_USERNAME_CHANGE', meta);
    const from = s.oldUsername ? `@${s.oldUsername}` : '?';
    const to = s.username ? `@${s.username}` : '?';
    return `${from} → ${to}`;
  }
  if (action === 'PRODUCT_CREATE' || action === 'PRODUCT_UPDATE' || action === 'PRODUCT_TOGGLE' || action === 'PRODUCT_DELETE') {
    const p = parseMeta(action, meta);
    const name = p.name ?? '-';
    if (action === 'PRODUCT_CREATE' && p.sellingPrice !== null)
      return `${name} · jual ${fmtRupiah(p.sellingPrice)}`;
    if (action === 'PRODUCT_UPDATE' && p.fields && p.fields.length > 0)
      return `${name} · ubah ${p.fields.join(', ')}`;
    if (action === 'PRODUCT_TOGGLE' && p.isActive !== null)
      return `${name} · ${p.isActive ? 'diaktifkan' : 'dinonaktifkan'}`;
    return name;
  }
  if (action === 'DISCOUNT_CREATE' || action === 'DISCOUNT_UPDATE' || action === 'DISCOUNT_TOGGLE' || action === 'DISCOUNT_DELETE') {
    const d = parseMeta(action, meta);
    const name = d.name ?? '-';
    if ((action === 'DISCOUNT_CREATE' || action === 'DISCOUNT_UPDATE') && d.percent !== null)
      return `${name} · ${d.percent}%`;
    if (action === 'DISCOUNT_TOGGLE' && d.isActive !== null)
      return `${name} · ${d.isActive ? 'diaktifkan' : 'dinonaktifkan'}`;
    return name;
  }
  const s = parseMeta(action, meta);
  const user = s.username ? `@${s.username}` : null;
  return [user, s.name].filter((x): x is string => !!x).join(' · ');
}

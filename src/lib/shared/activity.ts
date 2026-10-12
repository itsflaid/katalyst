import { fmtRupiah } from './format';

export const ACTIVITY_ACTIONS = [
  'LOGIN',
  'TX_CREATE',
  'TX_VOID',
  'STAFF_INVITE',
  'STAFF_DELETE',
  'STAFF_PASSWORD_RESET'
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];
export const isActivityAction = (v: unknown): v is ActivityAction =>
  typeof v === 'string' && (ACTIVITY_ACTIONS as readonly string[]).includes(v);

export const ACTIVITY_LABEL: Record<ActivityAction, string> = {
  LOGIN: 'Login',
  TX_CREATE: 'Mencatat transaksi',
  TX_VOID: 'Void struk',
  STAFF_INVITE: 'Mengundang staff',
  STAFF_DELETE: 'Menghapus staff',
  STAFF_PASSWORD_RESET: 'Reset password staff'
};

export const ROLE_FILTERS = ['all', 'owner', 'staff'] as const;
export type RoleFilter = (typeof ROLE_FILTERS)[number];

export const ACTION_FILTERS = [
  { key: 'login', label: 'Login', actions: ['LOGIN'] },
  { key: 'transaksi', label: 'Transaksi', actions: ['TX_CREATE', 'TX_VOID'] },
  { key: 'void', label: 'Void', actions: ['TX_VOID'] },
  { key: 'staff', label: 'Kelola staff', actions: ['STAFF_INVITE', 'STAFF_DELETE', 'STAFF_PASSWORD_RESET'] }
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

export function parseMeta(action: ActivityAction, raw: unknown): LoginMeta | TxCreateMeta | TxVoidMeta | StaffMeta {
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
  return { username: strOf(m.username), name: strOf(m.name) };
}

export function describeActivity(action: ActivityAction, meta: unknown): string {
  const m = parseMeta(action, meta);
  if (action === 'LOGIN') return '';
  if (action === 'TX_CREATE') {
    const t = m as TxCreateMeta;
    return `${fmtRupiah(t.total)} · ${t.itemCount} jenis, ${t.qty} item`;
  }
  if (action === 'TX_VOID') {
    const t = m as TxVoidMeta;
    return `${fmtRupiah(t.total)} · kasir ${t.cashierName ?? '-'}`;
  }
  const s = m as StaffMeta;
  const user = s.username ? `@${s.username}` : null;
  return [user, s.name].filter((x): x is string => !!x).join(' · ');
}

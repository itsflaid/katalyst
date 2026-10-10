// Helper zona waktu per bisnis (WIB/WITA/WIT, offset tetap tanpa DST).
// Murni tanpa dependensi, dipakai server & komponen. Aturan: semua bucket
// waktu & tampilan memakai zona bisnis, bukan UTC / lokal browser.

export const BIZ_TZS = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] as const;
export type BizTz = (typeof BIZ_TZS)[number];
export const DEFAULT_TZ: BizTz = 'Asia/Makassar';
export const TZ_INFO: Record<BizTz, { short: 'WIB' | 'WITA' | 'WIT'; offsetHours: 7 | 8 | 9; label: string }> = {
  'Asia/Jakarta': { short: 'WIB', offsetHours: 7, label: 'WIB: Waktu Indonesia Barat (UTC+7)' },
  'Asia/Makassar': { short: 'WITA', offsetHours: 8, label: 'WITA: Waktu Indonesia Tengah (UTC+8)' },
  'Asia/Jayapura': { short: 'WIT', offsetHours: 9, label: 'WIT: Waktu Indonesia Timur (UTC+9)' }
};
export const isBizTz = (v: unknown): v is BizTz =>
  typeof v === 'string' && (BIZ_TZS as readonly string[]).includes(v);

export function deviceTzToBizTz(tz: string): BizTz | null {
  if (tz === 'Asia/Jakarta' || tz === 'Asia/Pontianak') return 'Asia/Jakarta';
  if (tz === 'Asia/Makassar') return 'Asia/Makassar';
  if (tz === 'Asia/Jayapura') return 'Asia/Jayapura';
  return null;
}

export function makeTime(tz: BizTz) {
  const info = TZ_INFO[tz];
  if (!info) throw new Error(`Zona waktu tidak valid: ${String(tz)}`);
  const offsetMs = info.offsetHours * 3600_000;

  function toLocal(d: Date): Date {
    return new Date(d.getTime() + offsetMs);
  }

  function startOfDay(d: Date): Date {
    const w = toLocal(d);
    const midnightUtc = Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate());
    return new Date(midnightUtc - offsetMs);
  }

  function endOfDay(d: Date): Date {
    return new Date(startOfDay(d).getTime() + 86400000 - 1);
  }

  function addDays(d: Date, n: number): Date {
    return new Date(d.getTime() + n * 86400000);
  }

  function dayKey(d: Date): string {
    const w = toLocal(d);
    const y = w.getUTCFullYear();
    const m = String(w.getUTCMonth() + 1).padStart(2, '0');
    const day = String(w.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function parseDay(s: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const dd = Number(m[3]);
    if (mo < 1 || mo > 12 || dd < 1 || dd > 31) return null;
    const instant = new Date(Date.UTC(y, mo - 1, dd) - offsetMs);
    if (dayKey(instant) !== `${m[1]}-${m[2]}-${m[3]}`) return null;
    return instant;
  }

  function isoDow(d: Date): number {
    const dow = toLocal(d).getUTCDay();
    return ((dow + 6) % 7) + 1;
  }

  function fmt(d: string | Date, opts: Intl.DateTimeFormatOptions): string {
    const date = typeof d === 'string' ? new Date(d) : d;
    return new Intl.DateTimeFormat('id-ID', { timeZone: tz, ...opts }).format(date);
  }

  return { tz, short: info.short, offsetMs, toLocal, startOfDay, endOfDay, addDays, dayKey, parseDay, isoDow, fmt };
}
export type BizTime = ReturnType<typeof makeTime>;

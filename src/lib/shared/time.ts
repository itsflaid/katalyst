// Helper zona waktu per bisnis (WIB/WITA/WIT, offset tetap tanpa DST).
// Murni tanpa dependensi — dipakai server & komponen.
// Aturan: semua bucket waktu & tampilan memakai zona bisnis, bukan UTC / lokal browser.

export const BIZ_TZS = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] as const;
export type BizTz = (typeof BIZ_TZS)[number];
export const DEFAULT_TZ: BizTz = 'Asia/Makassar';
export const TZ_INFO: Record<BizTz, { short: 'WIB' | 'WITA' | 'WIT'; offsetHours: 7 | 8 | 9; label: string }> = {
  'Asia/Jakarta': { short: 'WIB', offsetHours: 7, label: 'WIB — Waktu Indonesia Barat (UTC+7)' },
  'Asia/Makassar': { short: 'WITA', offsetHours: 8, label: 'WITA — Waktu Indonesia Tengah (UTC+8)' },
  'Asia/Jayapura': { short: 'WIT', offsetHours: 9, label: 'WIT — Waktu Indonesia Timur (UTC+9)' }
};
export const isBizTz = (v: unknown): v is BizTz =>
  typeof v === 'string' && (BIZ_TZS as readonly string[]).includes(v);

// Pabrik helper terikat satu zona. Offset tetap valid karena Indonesia tanpa DST.
export function makeTime(tz: BizTz) {
  const info = TZ_INFO[tz];
  if (!info) throw new Error(`Zona waktu tidak valid: ${String(tz)}`);
  const offsetMs = info.offsetHours * 3600_000;

  // Date yang field getUTC*()-nya = jam dinding zona bisnis dari instant d.
  function toLocal(d: Date): Date {
    return new Date(d.getTime() + offsetMs);
  }

  // Instant 00:00 zona bisnis dari hari yang memuat d.
  function startOfDay(d: Date): Date {
    const w = toLocal(d);
    const midnightUtc = Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate());
    return new Date(midnightUtc - offsetMs);
  }

  // Instant 23:59:59.999 zona bisnis dari hari yang memuat d.
  function endOfDay(d: Date): Date {
    return new Date(startOfDay(d).getTime() + 86400000 - 1);
  }

  function addDays(d: Date, n: number): Date {
    return new Date(d.getTime() + n * 86400000);
  }

  // 'YYYY-MM-DD' menurut kalender zona bisnis.
  function dayKey(d: Date): string {
    const w = toLocal(d);
    const y = w.getUTCFullYear();
    const m = String(w.getUTCMonth() + 1).padStart(2, '0');
    const day = String(w.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // 'YYYY-MM-DD' → instant 00:00 zona bisnis. null kalau format/kalender tidak valid
  // (mis. '2026-02-30' → null, bukan geser ke Maret).
  function parseDay(s: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const dd = Number(m[3]);
    if (mo < 1 || mo > 12 || dd < 1 || dd > 31) return null;
    const instant = new Date(Date.UTC(y, mo - 1, dd) - offsetMs);
    // Verifikasi round-trip: kalau tanggal fiktif (mis. 30 Feb), wall-clock
    // hasil konversi tidak akan sama dengan input.
    if (dayKey(instant) !== `${m[1]}-${m[2]}-${m[3]}`) return null;
    return instant;
  }

  // 1=Senin … 7=Minggu menurut hari zona bisnis.
  function isoDow(d: Date): number {
    const dow = toLocal(d).getUTCDay(); // 0=Minggu … 6=Sabtu
    return ((dow + 6) % 7) + 1;
  }

  // Format id-ID dengan timeZone bisnis. opts diteruskan ke Intl.
  function fmt(d: string | Date, opts: Intl.DateTimeFormatOptions): string {
    const date = typeof d === 'string' ? new Date(d) : d;
    return new Intl.DateTimeFormat('id-ID', { timeZone: tz, ...opts }).format(date);
  }

  return { tz, short: info.short, offsetMs, toLocal, startOfDay, endOfDay, addDays, dayKey, parseDay, isoDow, fmt };
}
export type BizTime = ReturnType<typeof makeTime>;

// ---------------------------------------------------------------------------
// Wrapper lama — @deprecated, dipertahankan sementara agar verify-time lama
// tetap lulus tanpa diubah (bukti tidak ada regresi). Dihapus di Commit 0.5.
// ---------------------------------------------------------------------------
const _default = makeTime(DEFAULT_TZ);
/** @deprecated pakai makeTime(tz) */
export const TZ = 'Asia/Makassar';
/** @deprecated pakai makeTime(tz).offsetMs */
export const TZ_OFFSET_MS = 8 * 3600_000;
/** @deprecated pakai makeTime(tz).toLocal */
export function toWita(d: Date): Date {
  return _default.toLocal(d);
}
/** @deprecated pakai makeTime(tz).startOfDay */
export function startOfDayWita(d: Date): Date {
  return _default.startOfDay(d);
}
/** @deprecated pakai makeTime(tz).endOfDay */
export function endOfDayWita(d: Date): Date {
  return _default.endOfDay(d);
}
/** @deprecated pakai makeTime(tz).addDays */
export function addDaysWita(d: Date, n: number): Date {
  return _default.addDays(d, n);
}
/** @deprecated pakai makeTime(tz).dayKey */
export function dayKeyWita(d: Date): string {
  return _default.dayKey(d);
}
/** @deprecated pakai makeTime(tz).parseDay */
export function parseDayWita(s: string): Date | null {
  return _default.parseDay(s);
}
/** @deprecated pakai makeTime(tz).isoDow */
export function isoDowWita(d: Date): number {
  return _default.isoDow(d);
}
/** @deprecated pakai makeTime(tz).fmt */
export function fmtWita(d: string | Date, opts: Intl.DateTimeFormatOptions): string {
  return _default.fmt(d, opts);
}

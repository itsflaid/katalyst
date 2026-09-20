// Helper waktu WITA (Asia/Makassar, UTC+8 tetap, tanpa DST).
// Murni tanpa dependensi — dipakai server & komponen.
// Aturan: semua bucket waktu & tampilan memakai WITA, bukan UTC / lokal browser.

export const TZ = 'Asia/Makassar';
export const TZ_OFFSET_MS = 8 * 3600_000;

// Date yang field getUTC*()-nya = jam dinding WITA dari instant d.
export function toWita(d: Date): Date {
  return new Date(d.getTime() + TZ_OFFSET_MS);
}

// Instant 00:00 WITA dari hari-WITA yang memuat d.
export function startOfDayWita(d: Date): Date {
  const w = toWita(d);
  const midnightUtc = Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate());
  return new Date(midnightUtc - TZ_OFFSET_MS);
}

// Instant 23:59:59.999 WITA dari hari-WITA yang memuat d.
export function endOfDayWita(d: Date): Date {
  return new Date(startOfDayWita(d).getTime() + 86400000 - 1);
}

export function addDaysWita(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

// 'YYYY-MM-DD' menurut kalender WITA.
export function dayKeyWita(d: Date): string {
  const w = toWita(d);
  const y = w.getUTCFullYear();
  const m = String(w.getUTCMonth() + 1).padStart(2, '0');
  const day = String(w.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 'YYYY-MM-DD' → instant 00:00 WITA. null kalau format/kalender tidak valid
// (mis. '2026-02-30' → null, bukan geser ke Maret).
export function parseDayWita(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const dd = Number(m[3]);
  if (mo < 1 || mo > 12 || dd < 1 || dd > 31) return null;
  const instant = new Date(Date.UTC(y, mo - 1, dd) - TZ_OFFSET_MS);
  // Verifikasi round-trip: kalau tanggal fiktif (mis. 30 Feb), wall-clock
  // hasil konversi tidak akan sama dengan input.
  if (dayKeyWita(instant) !== `${m[1]}-${m[2]}-${m[3]}`) return null;
  return instant;
}

// 1=Senin … 7=Minggu menurut hari WITA.
export function isoDowWita(d: Date): number {
  const dow = toWita(d).getUTCDay(); // 0=Minggu … 6=Sabtu
  return ((dow + 6) % 7) + 1;
}

// Format id-ID dengan timeZone WITA. opts diteruskan ke Intl.
export function fmtWita(d: string | Date, opts: Intl.DateTimeFormatOptions): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('id-ID', { timeZone: TZ, ...opts }).format(date);
}

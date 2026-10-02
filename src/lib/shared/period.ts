// Gabungan resolveStatistikRange + resolveSimulatorRange (sebelumnya
// copy-paste di domains/stats/loaders.ts). Murni: jam masuk lewat `now`;
// hanya import relatif.
// Output label/fromISO/toISO dan semantik minggu/bulan/custom IDENTIK
// dengan dua resolver lama (dibuktikan verify-period vs oracle beku).
import { makeTime, type BizTz } from './time';

export type PeriodKey = 'today' | 'week' | 'month' | '30d' | 'all' | 'custom';

export interface Period {
  key: PeriodKey;
  from: Date | null;
  to: Date | null;
  label: string;
  fromISO: string;
  toISO: string;
}

export interface ResolveOpts {
  default: PeriodKey;
  allow: PeriodKey[];
}

export function resolvePeriod(url: URL, tz: BizTz, now: Date, opts: ResolveOpts): Period {
  const T = makeTime(tz);
  const rawParam = (url.searchParams.get('range') ?? opts.default).toLowerCase();
  // Hanya today/week/month/custom yang punya cabang; sisanya (termasuk
  // '30d'/'all'/sampah) jatuh ke cabang default di bawah — persis seperti
  // fallthrough dua resolver lama. Allow menyaring cabang yang dikenal.
  const KNOWN = ['today', 'week', 'month', 'custom'];
  const key =
    KNOWN.includes(rawParam) && (opts.allow as string[]).includes(rawParam)
      ? (rawParam as PeriodKey)
      : null;
  const iso = (d: Date) => T.dayKey(d);
  const fmtLong = (d: Date) => T.fmt(d, { day: 'numeric', month: 'short', year: 'numeric' });
  if (key === 'today') {
    const from = T.startOfDay(now);
    return { key, from, to: now, label: 'Hari ini', fromISO: '', toISO: '' };
  }
  if (key === 'week') {
    // Senin 00:00 zona bisnis → sekarang (konvensi Indonesia).
    const dow = T.toLocal(now).getUTCDay();
    const offset = (dow + 6) % 7;
    const from = T.startOfDay(T.addDays(now, -offset));
    return { key, from, to: now, label: 'Minggu ini (Senin–sekarang)', fromISO: '', toISO: '' };
  }
  if (key === 'month') {
    const w = T.toLocal(now);
    const from = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), 1) - T.offsetMs);
    return { key, from, to: now, label: 'Bulan ini', fromISO: '', toISO: '' };
  }
  if (key === 'custom') {
    const f = T.parseDay(url.searchParams.get('from') ?? '');
    const tRaw = T.parseDay(url.searchParams.get('to') ?? '');
    // Semantik custom mengikuti pemanggil lama: simulator (allow memuat
    // 'all') mengizinkan from null + tanpa swap; statistik memakai fallback
    // −29 hari + swap bila from > to.
    if ((opts.allow as string[]).includes('all')) {
      if (!f && !tRaw) return { key: 'all', from: null, to: null, label: 'Semua waktu', fromISO: '', toISO: '' };
      const from = f ?? null;
      const to = tRaw ? T.endOfDay(tRaw) : now;
      const label = from && tRaw ? `${fmtLong(from)} – ${fmtLong(T.endOfDay(tRaw))}` : from ? `Sejak ${fmtLong(from)}` : `Sampai ${fmtLong(to!)}`;
      // iso buat <input type="date"> memakai hari zona bisnis.
      return { key: 'custom', from, to, label: `Custom: ${label}`, fromISO: from ? iso(from) : '', toISO: tRaw ? iso(T.endOfDay(tRaw)) : '' };
    }
    if (f || tRaw) {
      const from = f ?? T.addDays(T.startOfDay(now), -29);
      const to = tRaw ? T.endOfDay(tRaw) : now;
      const [a, b] = from <= to ? [from, to] : [to, from];
      return { key: 'custom', from: a, to: b, label: `Custom: ${fmtLong(a)} – ${fmtLong(b)}`, fromISO: iso(a), toISO: iso(b) };
    }
  }
  // Cabang default per keluarga pemanggil (fallthrough resolver lama):
  // simulator (allow memuat 'all') → semua waktu; statistik → 30 hari.
  if ((opts.allow as string[]).includes('all')) {
    return { key: 'all', from: null, to: null, label: 'Semua waktu', fromISO: '', toISO: '' };
  }
  const from = T.startOfDay(T.addDays(now, -29));
  return { key: '30d', from, to: now, label: '30 hari terakhir', fromISO: '', toISO: '' };
}

// Jendela tepat sebelum `p` dengan durasi sama (perilaku lama: prevTo =
// p.from, query memakai lte sehingga transaksi tepat di instan from
// terhitung dua kali — dipertahankan apa adanya; perbaikan terpisah F2).
export function previousWindow(p: Period & { from: Date; to: Date }): { from: Date; to: Date } {
  const dur = p.to.getTime() - p.from.getTime();
  const prevTo = p.from;
  const prevFrom = new Date(p.from.getTime() - Math.max(dur, 1));
  return { from: prevFrom, to: prevTo };
}

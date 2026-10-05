// Satu resolver periode untuk statistik + simulator (semantik minggu/bulan/custom sama).
// Murni: jam masuk lewat `now`; hanya import relatif.
import { makeTime, type BizTz } from './time';

export type PeriodKey = 'today' | 'week' | 'month' | '30d' | 'all' | 'custom';
export type NamedPeriodKey = 'today' | 'this_week' | 'this_month' | 'last_30d' | 'custom';

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
    if ((opts.allow as string[]).includes('all')) {
      if (!f && !tRaw) return { key: 'all', from: null, to: null, label: 'Semua waktu', fromISO: '', toISO: '' };
      const from = f ?? null;
      const to = tRaw ? T.endOfDay(tRaw) : now;
      const label = from && tRaw ? `${fmtLong(from)} – ${fmtLong(T.endOfDay(tRaw))}` : from ? `Sejak ${fmtLong(from)}` : `Sampai ${fmtLong(to!)}`;
      return { key: 'custom', from, to, label: `Custom: ${label}`, fromISO: from ? iso(from) : '', toISO: tRaw ? iso(T.endOfDay(tRaw)) : '' };
    }
    if (f || tRaw) {
      const from = f ?? T.addDays(T.startOfDay(now), -29);
      const to = tRaw ? T.endOfDay(tRaw) : now;
      const [a, b] = from <= to ? [from, to] : [to, from];
      return { key: 'custom', from: a, to: b, label: `Custom: ${fmtLong(a)} – ${fmtLong(b)}`, fromISO: iso(a), toISO: iso(b) };
    }
  }
  if ((opts.allow as string[]).includes('all')) {
    return { key: 'all', from: null, to: null, label: 'Semua waktu', fromISO: '', toISO: '' };
  }
  const from = T.startOfDay(T.addDays(now, -29));
  return { key: '30d', from, to: now, label: '30 hari terakhir', fromISO: '', toISO: '' };
}

export function previousWindow(p: Period & { from: Date; to: Date }): { from: Date; to: Date } {
  const dur = p.to.getTime() - p.from.getTime();
  const prevTo = p.from;
  const prevFrom = new Date(p.from.getTime() - Math.max(dur, 1));
  return { from: prevFrom, to: prevTo };
}

const MAX_CUSTOM_DAYS = 366;

export function resolveNamedPeriod(
  key: NamedPeriodKey,
  tz: BizTz,
  now: Date,
  custom?: { from: string; to: string }
): Period {
  const range = key === 'this_week' ? 'week' : key === 'this_month' ? 'month' : key === 'last_30d' ? '30d' : key;
  const url = new URL(`http://internal/?range=${range}`);
  if (custom) {
    url.searchParams.set('from', custom.from);
    url.searchParams.set('to', custom.to);
  }
  const period = resolvePeriod(url, tz, now, { default: '30d', allow: ['today', 'week', 'month', 'custom'] });
  if (key !== 'custom') return period;
  // Custom tak valid atau lebih dari 366 hari dikembalikan tanpa from/to; pemanggil menolaknya.
  const T = makeTime(tz);
  const valid = !!custom && !!T.parseDay(custom.from) && !!T.parseDay(custom.to);
  const tooLong = !!period.from && !!period.to && period.to.getTime() - period.from.getTime() > MAX_CUSTOM_DAYS * 86_400_000;
  return valid && !tooLong ? period : { ...period, from: null, to: null };
}

export function comparableWindow(period: Period & { from: Date; to: Date }): { from: Date; to: Date } {
  return previousWindow(period);
}

// Satu resolver periode untuk statistik + simulator (semantik minggu/bulan/custom sama).
// Murni: jam masuk lewat `now`; hanya import relatif.
import { makeTime, type BizTz } from './time';

export type PeriodKey = 'today' | 'week' | 'month' | '30d' | 'all' | 'custom' | 'yesterday' | 'last_week' | 'last_month' | 'last_7d' | 'last_90d';
export type NamedPeriodKey = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'last_30d' | 'last_7d' | 'last_90d' | 'custom';

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
  const T = makeTime(tz);
  const iso = (d: Date) => T.dayKey(d);
  if (key === 'yesterday') {
    const from = T.startOfDay(T.addDays(now, -1));
    const to = T.endOfDay(T.addDays(now, -1));
    return { key, from, to, label: 'Kemarin', fromISO: iso(from), toISO: iso(to) };
  }
  if (key === 'last_week') {
    const dow = T.toLocal(now).getUTCDay();
    const from = T.startOfDay(T.addDays(now, -((dow + 6) % 7) - 7));
    const to = T.endOfDay(T.addDays(from, 6));
    return { key, from, to, label: 'Minggu lalu (Senin–Minggu)', fromISO: iso(from), toISO: iso(to) };
  }
  if (key === 'last_month') {
    const w = T.toLocal(now);
    const from = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth() - 1, 1) - T.offsetMs);
    const last = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), 0) - T.offsetMs);
    const to = T.endOfDay(last);
    return { key, from, to, label: 'Bulan lalu', fromISO: iso(from), toISO: iso(to) };
  }
  const range = key === 'this_week' ? 'week' : key === 'this_month' ? 'month' : key === 'last_30d' ? '30d' : key;
  if (key === 'last_7d' || key === 'last_90d') {
    const days = key === 'last_7d' ? 7 : 90;
    const from = T.startOfDay(T.addDays(now, -(days - 1)));
    return { key, from, to: now, label: key === 'last_7d' ? '7 hari terakhir' : '90 hari terakhir', fromISO: '', toISO: '' };
  }
  const url = new URL(`http://internal/?range=${range}`);
  if (custom) {
    url.searchParams.set('from', custom.from);
    url.searchParams.set('to', custom.to);
  }
  const period = resolvePeriod(url, tz, now, { default: '30d', allow: ['today', 'week', 'month', 'custom'] });
  if (key !== 'custom') return period;
  // Custom tak valid atau lebih dari 366 hari dikembalikan tanpa from/to; pemanggil menolaknya.
  const valid = !!custom && !!T.parseDay(custom.from) && !!T.parseDay(custom.to);
  const tooLong = !!period.from && !!period.to && period.to.getTime() - period.from.getTime() > MAX_CUSTOM_DAYS * 86_400_000;
  return valid && !tooLong ? period : { ...period, from: null, to: null };
}

export interface BaselineWindow {
  from: Date;
  to: Date;
  clamped: boolean;
}

// Pembanding sejajar jam dinding: durasi berjalan yang sama dari awal periode
// sebelumnya (Senin untuk pekan, tanggal 1 untuk bulan). Periode penuh memakai
// periode penuh sebelumnya; last_30d dan custom menempel seperti sebelumnya.
export function comparableWindow(
  window: { from: Date; to: Date; key: NamedPeriodKey },
  tz: BizTz,
  now: Date
): BaselineWindow {
  const T = makeTime(tz);
  const { from, to, key } = window;
  const dur = to.getTime() - from.getTime();
  if (key === 'last_30d' || key === 'last_7d' || key === 'last_90d' || key === 'custom') {
    return { from: new Date(from.getTime() - dur), to: new Date(from.getTime() - 1), clamped: false };
  }
  if (key === 'yesterday') {
    const day = T.startOfDay(T.addDays(from, -1));
    return { from: day, to: T.endOfDay(day), clamped: false };
  }
  if (key === 'last_week') {
    const start = T.startOfDay(T.addDays(from, -7));
    return { from: start, to: T.endOfDay(T.addDays(start, 6)), clamped: false };
  }
  if (key === 'last_month') {
    const w = T.toLocal(from);
    const first = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth() - 1, 1) - T.offsetMs);
    const last = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), 0) - T.offsetMs);
    return { from: first, to: T.endOfDay(last), clamped: false };
  }
  if (key === 'today') {
    const base = T.startOfDay(T.addDays(now, -1));
    return { from: base, to: new Date(base.getTime() + dur), clamped: false };
  }
  if (key === 'this_week') {
    const dow = T.toLocal(now).getUTCDay();
    const base = T.startOfDay(T.addDays(now, -(((dow + 6) % 7) + 7)));
    return { from: base, to: new Date(base.getTime() + dur), clamped: false };
  }
  const w = T.toLocal(now);
  const base = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth() - 1, 1) - T.offsetMs);
  const monthEnd = T.endOfDay(new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), 0) - T.offsetMs));
  const rawTo = new Date(base.getTime() + dur);
  if (rawTo.getTime() > monthEnd.getTime()) return { from: base, to: monthEnd, clamped: true };
  return { from: base, to: rawTo, clamped: false };
}

const SHORT_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Label rentang tanggal nyata zona bisnis, mis. "1–4 Sep 2026 (sampai jam 08.19)".
export function spanLabel(from: Date, to: Date, tz: BizTz): string {
  const T = makeTime(tz);
  const a = T.toLocal(from);
  const b = T.toLocal(to);
  const mon = (d: Date) => SHORT_MONTH[d.getUTCMonth()];
  let span: string;
  if (T.dayKey(from) === T.dayKey(to)) span = `${a.getUTCDate()} ${mon(a)} ${a.getUTCFullYear()}`;
  else if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()) {
    span = `${a.getUTCDate()}–${b.getUTCDate()} ${mon(b)} ${b.getUTCFullYear()}`;
  } else if (a.getUTCFullYear() === b.getUTCFullYear()) {
    span = `${a.getUTCDate()} ${mon(a)}–${b.getUTCDate()} ${mon(b)} ${b.getUTCFullYear()}`;
  } else {
    span = `${a.getUTCDate()} ${mon(a)} ${a.getUTCFullYear()}–${b.getUTCDate()} ${mon(b)} ${b.getUTCFullYear()}`;
  }
  if (to.getTime() < T.endOfDay(to).getTime()) {
    return `${span} (sampai jam ${String(b.getUTCHours()).padStart(2, '0')}.${String(b.getUTCMinutes()).padStart(2, '0')})`;
  }
  return span;
}

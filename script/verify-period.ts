// Verifikasi resolver periode vs oracle beku (salinan verbatim dari loaders.ts).
// Jam oracle dibekukan via patch Date; resolvePeriod menerima `now` eksplisit.
// Fuzzing acak ber-seed; exit 1 bila ada FAIL.
import { makeTime, type BizTz } from '../src/lib/shared/time';
import { previousWindow, resolvePeriod, type PeriodKey } from '../src/lib/shared/period';

let passCount = 0;
let failCount = 0;
function ok(label: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  \x1b[32mPASS\x1b[0m  ${label}`);
    passCount++;
  } else {
    console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? `: ${detail}` : ''}`);
    failCount++;
  }
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261004);
const ri = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;

// ORACLE BEKU: salinan verbatim resolveStatistikRange / resolveSimulatorRange
// dari src/lib/server/domains/stats/loaders.ts. Jangan diubah: dipakai sebagai
// patokan stabil.

type StatistikRangeKey = 'today' | 'week' | '30d' | 'month' | 'custom';

function oracleStatistikRange(url: URL, tz: BizTz): { key: StatistikRangeKey; from: Date; to: Date; label: string; fromISO: string; toISO: string } {
  const T = makeTime(tz);
  const raw = (url.searchParams.get('range') ?? '30d').toLowerCase();
  const now = new Date();
  const iso = (d: Date) => T.dayKey(d);
  if (raw === 'today') {
    const from = T.startOfDay(now);
    return { key: 'today', from, to: now, label: 'Hari ini', fromISO: '', toISO: '' };
  }
  if (raw === 'week') {
    // Senin 00:00 zona bisnis → sekarang (konvensi Indonesia).
    const dow = T.toLocal(now).getUTCDay();
    const offset = (dow + 6) % 7;
    const from = T.startOfDay(T.addDays(now, -offset));
    return { key: 'week', from, to: now, label: 'Minggu ini (Senin–sekarang)', fromISO: '', toISO: '' };
  }
  if (raw === 'month') {
    const w = T.toLocal(now);
    const firstLocal = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), 1) - T.offsetMs);
    return { key: 'month', from: firstLocal, to: now, label: 'Bulan ini', fromISO: '', toISO: '' };
  }
  if (raw === 'custom') {
    const f = T.parseDay(url.searchParams.get('from') ?? '');
    const tRaw = T.parseDay(url.searchParams.get('to') ?? '');
    if (f || tRaw) {
      const from = f ?? T.addDays(T.startOfDay(now), -29);
      const to = tRaw ? T.endOfDay(tRaw) : now;
      const [a, b] = from <= to ? [from, to] : [to, from];
      const fmt = (d: Date) => T.fmt(d, { day: 'numeric', month: 'short', year: 'numeric' });
      return { key: 'custom', from: a, to: b, label: `Custom: ${fmt(a)} – ${fmt(b)}`, fromISO: iso(a), toISO: iso(b) };
    }
  }
  const from = T.startOfDay(T.addDays(now, -29));
  return { key: '30d', from, to: now, label: '30 hari terakhir', fromISO: '', toISO: '' };
}

type SimulatorRangeKey = 'today' | 'week' | 'month' | 'all' | 'custom';

function oracleSimulatorRange(url: URL, tz: BizTz): { key: SimulatorRangeKey; from: Date | null; to: Date | null; label: string; fromISO: string; toISO: string } {
  const T = makeTime(tz);
  const raw = (url.searchParams.get('range') ?? 'month').toLowerCase();
  const now = new Date();
  if (raw === 'today') {
    const from = T.startOfDay(now);
    return { key: 'today', from, to: now, label: 'Hari ini', fromISO: '', toISO: '' };
  }
  if (raw === 'week') {
    // Minggu ini: Senin 00:00 zona bisnis → sekarang (konvensi Indonesia).
    const dow = T.toLocal(now).getUTCDay();
    const offset = (dow + 6) % 7;
    const from = T.startOfDay(T.addDays(now, -offset));
    return { key: 'week', from, to: now, label: 'Minggu ini (Senin–sekarang)', fromISO: '', toISO: '' };
  }
  if (raw === 'month') {
    const w = T.toLocal(now);
    const from = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), 1) - T.offsetMs);
    return { key: 'month', from, to: now, label: 'Bulan ini', fromISO: '', toISO: '' };
  }
  if (raw === 'custom') {
    const f = T.parseDay(url.searchParams.get('from') ?? '');
    const tRaw = T.parseDay(url.searchParams.get('to') ?? '');
    if (!f && !tRaw) return { key: 'all', from: null, to: null, label: 'Semua waktu', fromISO: '', toISO: '' };
    const from = f ?? null;
    const to = tRaw ? T.endOfDay(tRaw) : now;
    const fmt = (d: Date) => T.fmt(d, { day: 'numeric', month: 'short', year: 'numeric' });
    const label = from && tRaw ? `${fmt(from)} – ${fmt(T.endOfDay(tRaw))}` : from ? `Sejak ${fmt(from)}` : `Sampai ${fmt(to!)}`;
    // iso buat <input type="date"> memakai hari zona bisnis.
    const localIso = (d: Date) => T.dayKey(d);
    return { key: 'custom', from, to, label: `Custom: ${label}`, fromISO: from ? localIso(from) : '', toISO: tRaw ? localIso(T.endOfDay(tRaw)) : '' };
  }
  return { key: 'all', from: null, to: null, label: 'Semua waktu', fromISO: '', toISO: '' };
}

// Fuzzing jam

const RealDate = globalThis.Date;

// Bekukan jam untuk oracle (yang memanggil new Date() tanpa argumen).
function withFrozenNow<T>(iso: string, fn: () => T): T {
  const fixed = new RealDate(iso).getTime();
  class FakeDate extends RealDate {
    constructor(...args: never[]) {
      super(...args);
      if (args.length === 0) this.setTime(fixed);
    }
    static now(): number {
      return fixed;
    }
  }
  globalThis.Date = FakeDate as unknown as typeof RealDate;
  try {
    return fn();
  } finally {
    globalThis.Date = RealDate;
  }
}

function norm(r: { key: string; from: Date | null; to: Date | null; label: string; fromISO: string; toISO: string }) {
  return {
    key: r.key,
    from: r.from ? r.from.toISOString() : null,
    to: r.to ? r.to.toISOString() : null,
    label: r.label,
    fromISO: r.fromISO,
    toISO: r.toISO
  };
}

const TZS: BizTz[] = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'];
const STAT_ALLOW: PeriodKey[] = ['today', 'week', 'month', '30d', 'custom'];
const SIM_ALLOW: PeriodKey[] = ['today', 'week', 'month', 'all', 'custom'];

// Instant uji: dekat tengah malam UTC vs lokal, tgl 31, Minggu/Senin, awal bulan.
const FIXED_NOWS = [
  '2026-09-29T16:30:00Z',
  '2026-09-14T15:59:00Z',
  '2026-09-14T16:00:00Z',
  '2026-09-14T16:01:00Z',
  '2026-08-31T16:00:00Z',
  '2026-09-20T12:00:00Z', // Minggu
  '2026-09-21T00:00:01Z', // Senin
  '2026-09-01T00:00:00Z',
  '2026-10-02T07:00:00Z'
];

function randomNow(): string {
  // Basis acak ±60 hari dari 15 Sep 2026 + jam acak (mungkin dekat tengah malam).
  const base = new RealDate('2026-09-15T12:00:00Z').getTime();
  const t = base + ri(-60, 60) * 86400000 + ri(0, 86399) * 1000;
  return new RealDate(t).toISOString();
}

const CUSTOM_VARIANTS: string[] = [
  'range=custom&from=2026-08-02&to=2026-08-31',
  'range=custom&from=2026-08-31&to=2026-08-02', // from > to (swap ala statistik)
  'range=custom&from=2026-08-02', // hanya from
  'range=custom&to=2026-08-31', // hanya to
  'range=custom&from=2026-02-30&to=2026-08-31', // tanggal fiktif
  'range=custom&from=asal&to=', // aneh
  'range=custom', // kosong
  'range=custom&from=&to=',
  'range=today',
  'range=week',
  'range=month',
  'range=30d',
  'range=all',
  'range=TODAY', // kapital (di-lowercase)
  'range=garbage',
  '' // tanpa param
];

console.log('\n== paritas resolvePeriod vs oracle beku ==');
{
  let statOk = 0;
  let statTotal = 0;
  let simOk = 0;
  let simTotal = 0;
  let firstStatDiff = '';
  let firstSimDiff = '';
  const NOWS = [...FIXED_NOWS];
  while (NOWS.length < 30) NOWS.push(randomNow());
  for (const nowISO of NOWS) {
    for (const tz of TZS) {
      for (const q of CUSTOM_VARIANTS) {
        const url = new URL(`http://x/statistik${q ? `?${q}` : ''}`);
        const now = new RealDate(nowISO);
        const oStat = norm(withFrozenNow(nowISO, () => oracleStatistikRange(url, tz)));
        const gStat = norm(resolvePeriod(new URL(url), tz, now, { default: '30d', allow: STAT_ALLOW }));
        statTotal++;
        if (JSON.stringify(oStat) === JSON.stringify(gStat)) statOk++;
        else if (!firstStatDiff) firstStatDiff = `${nowISO} ${tz} [${q}]\n oracle=${JSON.stringify(oStat)}\n got   =${JSON.stringify(gStat)}`;
        const oSim = norm(withFrozenNow(nowISO, () => oracleSimulatorRange(url, tz)));
        const gSim = norm(resolvePeriod(new URL(url), tz, now, { default: 'month', allow: SIM_ALLOW }));
        simTotal++;
        if (JSON.stringify(oSim) === JSON.stringify(gSim)) simOk++;
        else if (!firstSimDiff) firstSimDiff = `${nowISO} ${tz} [${q}]\n oracle=${JSON.stringify(oSim)}\n got   =${JSON.stringify(gSim)}`;
      }
    }
  }
  ok(`statistik paritas ${statOk}/${statTotal} (≥300 kombinasi)`, statOk === statTotal && statTotal >= 300, firstStatDiff);
  ok(`simulator paritas ${simOk}/${simTotal} (≥300 kombinasi)`, simOk === simTotal && simTotal >= 300, firstSimDiff);
}

console.log('\n== previousWindow ==');
{
  const T = makeTime('Asia/Makassar');
  const from = T.startOfDay(new RealDate('2026-09-01T00:00:00Z'));
  const to = T.startOfDay(new RealDate('2026-09-10T00:00:00Z'));
  const prev = previousWindow({ key: 'custom', from, to, label: 'x', fromISO: '', toISO: '' });
  const dur = to.getTime() - from.getTime();
  ok('durasi sama', prev.to.getTime() - prev.from.getTime() === dur);
  ok('menempel tepat sebelum from (prevTo = from)', prev.to.getTime() === from.getTime());
  ok('prevFrom = from − dur', prev.from.getTime() === from.getTime() - Math.max(dur, 1));
}

console.log(`\n${passCount} passed, ${failCount} failed\n`);
if (failCount > 0) process.exit(1);

import { makeTime, type BizTz } from '../src/lib/shared/time';
import { buildMetricRows, type GroupedFacts } from '../src/lib/analytics/metric-rows';

let failed = 0;
function ok(label: string, pass: boolean, detail = '') {
  console.log(`  ${pass ? '\x1b[32mPASS' : '\x1b[31mFAIL'}\x1b[0m  ${label}${detail ? `: ${detail}` : ''}`);
  if (!pass) failed++;
}

function finiteDeep(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finiteDeep);
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).every(finiteDeep);
  return true;
}

function facts(qty: number, gross: number, discount: number, cost: number, txCount: number): GroupedFacts {
  return { qty, gross, discount, cost, discountedQty: 0, txCount };
}

const results: unknown[] = [];

{
  const T = makeTime('Asia/Makassar');
  const from = T.parseDay('2026-09-01')!;
  const to = T.endOfDay(T.parseDay('2026-09-29')!);
  const now = new Date('2026-09-29T00:00:00Z');
  const byDay = new Map<string, GroupedFacts>();
  for (const day of ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29']) {
    byDay.set(day, facts(1, 10000, 0, 6000, 2));
  }
  for (const day of ['2026-09-02', '2026-09-09', '2026-09-16', '2026-09-23']) {
    byDay.set(day, facts(1, 12000, 0, 7000, 2));
  }
  const res = buildMetricRows({ metric: 'revenue', groupBy: 'weekday', window: { from, to }, now, T, byDay, order: 'desc', limit: 10 });
  if (!res.ok) {
    ok('hari pekan dihitung', false);
  } else {
    results.push(res);
    const tue = res.data.rows.find((r) => r.label === 'Selasa')!;
    const wed = res.data.rows.find((r) => r.label === 'Rabu')!;
    ok('kemunculan Selasa 5 Rabu 4', tue.occurrences === 5 && wed.occurrences === 4);
    ok('peringkat memakai rata-rata', res.data.rows[0].label === 'Rabu' && res.data.summary.best?.label === 'Rabu');
    ok('teks rata-rata benar', tue.perOccurrenceText === 'Rp10.000' && wed.perOccurrenceText === 'Rp12.000');
    ok('catatan rata-rata ada', res.data.notes.some((n) => n.includes('rata-rata per hari')));
    ok('tujuh baris', res.data.rows.length === 7);
  }
}

{
  const T = makeTime('Asia/Makassar');
  const now = new Date('2026-09-29T00:00:00Z');
  const byProduct = new Map<string, GroupedFacts>([
    ['a', facts(5, 100, 0, 60, 5)],
    ['b', facts(3, 200, 0, 120, 3)],
    ['c', facts(1, 300, 0, 180, 1)]
  ]);
  const names = new Map([['a', 'A'], ['b', 'B'], ['c', 'C']]);
  const tx = buildMetricRows({ metric: 'tx_count', groupBy: 'product', window: { from: now, to: now }, now, T, byProduct, productNames: names, totalTxCount: 6, limit: 10 });
  if (!tx.ok) ok('struk produk tidak dijumlahkan', false);
  else {
    results.push(tx);
    ok('struk produk tidak dijumlahkan', tx.data.total.value === 6 && tx.data.rows.every((r) => r.shareText === undefined));
    ok('catatan struk ada', tx.data.notes.some((n) => n.includes('Satu struk')));
  }
  const rev = buildMetricRows({ metric: 'revenue', groupBy: 'product', window: { from: now, to: now }, now, T, byProduct, productNames: names, order: 'desc', limit: 2 });
  if (!rev.ok) ok('total aditif pra-limit', false);
  else {
    results.push(rev);
    ok('total aditif pra-limit', rev.data.total.value === 600 && rev.data.shown === 2 && rev.data.totalGroups === 3 && rev.data.truncated);
  }
}

{
  const T = makeTime('Asia/Makassar');
  const now = new Date('2026-09-29T00:00:00Z');
  const byDay = new Map<string, GroupedFacts>([
    ['2026-09-28', facts(10, 1000, 0, 500, 10)],
    ['2026-09-29', facts(90, 9000, 0, 8100, 30)]
  ]);
  const margin = buildMetricRows({ metric: 'margin', groupBy: 'none', window: { from: now, to: now }, now, T, byDay });
  const ticket = buildMetricRows({ metric: 'avg_ticket', groupBy: 'none', window: { from: now, to: now }, now, T, byDay });
  if (!margin.ok || !ticket.ok) ok('rasio dihitung ulang', false);
  else {
    results.push(margin, ticket);
    ok('margin gabungan bukan rata-rata', margin.data.total.valueText === '14,0%', margin.data.total.valueText);
    ok('tiket gabungan bukan rata-rata', ticket.data.total.value === 250 && ticket.data.total.valueText === 'Rp250');
  }
}

{
  const T = makeTime('Asia/Makassar');
  const byDay = new Map<string, GroupedFacts>([
    ['2026-09-30', facts(2, 20000, 0, 12000, 1)],
    ['2026-10-06', facts(3, 30000, 0, 18000, 2)]
  ]);
  const week = buildMetricRows({
    metric: 'revenue', groupBy: 'week',
    window: { from: T.parseDay('2026-09-30')!, to: T.endOfDay(T.parseDay('2026-10-07')!) },
    now: new Date('2026-10-07T00:00:00Z'), T, byDay
  });
  if (!week.ok) ok('bucket mulai Senin', false);
  else {
    results.push(week);
    ok(
      'bucket mulai Senin',
      week.data.rows.length === 2 &&
        week.data.rows[0].label === '28 Sep–4 Okt (sebagian)' &&
        week.data.rows[1].label === '5–7 Okt (sebagian)'
    );
  }
  const month = buildMetricRows({
    metric: 'revenue', groupBy: 'month',
    window: { from: T.parseDay('2026-09-15')!, to: T.endOfDay(T.parseDay('2026-10-20')!) },
    now: new Date('2026-10-20T00:00:00Z'), T, byDay: new Map([...byDay, ['2026-10-16', facts(1, 5000, 0, 3000, 1)]])
  });
  if (!month.ok) ok('label bulan sebagian', false);
  else {
    results.push(month);
    ok('label bulan sebagian', month.data.rows.map((r) => r.label).join('|') === 'Sep 2026 (sebagian)|Okt 2026 (sebagian)');
  }
  const hour = buildMetricRows({
    metric: 'tx_count', groupBy: 'hour',
    window: { from: T.parseDay('2026-09-30')!, to: T.endOfDay(T.parseDay('2026-09-30')!) },
    now: new Date('2026-09-30T00:00:00Z'), T,
    byHour: new Map<number, GroupedFacts>([[8, facts(2, 20000, 0, 12000, 1)], [10, facts(1, 10000, 0, 6000, 1)]])
  });
  if (!hour.ok) ok('nol hanya di antara jam aktif', false);
  else {
    results.push(hour);
    ok(
      'nol hanya di antara jam aktif',
      hour.data.rows.map((r) => r.key).join(',') === '8,9,10' &&
        hour.data.rows[1].value === 0 &&
        hour.data.rows[0].label === '08.00–08.59'
    );
  }
  const far = buildMetricRows({
    metric: 'revenue', groupBy: 'day',
    window: { from: T.parseDay('2026-09-01')!, to: T.endOfDay(T.parseDay('2026-10-10')!) },
    now: new Date('2026-10-10T00:00:00Z'), T, byDay
  });
  ok('per hari menolak rentang panjang', !far.ok && far.code === 'INVALID_ARGS');
}

{
  const instant = new Date('2026-09-29T16:30:00Z');
  const zones: BizTz[] = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'];
  const expected: Record<BizTz, string> = { 'Asia/Jakarta': '2026-09-29', 'Asia/Makassar': '2026-09-30', 'Asia/Jayapura': '2026-09-30' };
  for (const tz of zones) {
    const T = makeTime(tz);
    const byDay = new Map<string, GroupedFacts>([[T.dayKey(instant), facts(1, 10000, 0, 6000, 1)]]);
    const res = buildMetricRows({
      metric: 'revenue', groupBy: 'day',
      window: { from: T.startOfDay(new Date(instant.getTime() - 86_400_000)), to: T.endOfDay(new Date(instant.getTime() + 86_400_000)) },
      now: instant, T, byDay
    });
    ok(`zona ${tz} memakai hari bisnis`, res.ok && res.data.rows.some((r) => r.key === expected[tz] && r.value === 10000));
    if (res.ok) results.push(res);
  }
}

{
  const T = makeTime('Asia/Makassar');
  const now = new Date('2026-09-29T00:00:00Z');
  const byProduct = new Map<string, GroupedFacts>([
    ['b', facts(1, 100, 0, 60, 1)],
    ['a', facts(1, 100, 0, 60, 1)],
    ['c', facts(1, 50, 0, 30, 1)]
  ]);
  const names = new Map([['a', 'A'], ['b', 'B'], ['c', 'C']]);
  const res = buildMetricRows({ metric: 'revenue', groupBy: 'product', window: { from: now, to: now }, now, T, byProduct, productNames: names, order: 'desc', limit: 2 });
  if (!res.ok) ok('seri deterministik', false);
  else {
    results.push(res);
    ok('seri deterministik', res.data.rows.map((r) => r.label).join(',') === 'A,B' && res.data.truncated);
  }
}

{
  const T = makeTime('Asia/Makassar');
  const now = new Date('2026-09-29T00:00:00Z');
  const day = buildMetricRows({
    metric: 'margin', groupBy: 'day',
    window: { from: T.parseDay('2026-09-28')!, to: T.endOfDay(T.parseDay('2026-09-30')!) },
    now, T, byDay: new Map()
  });
  const hour = buildMetricRows({
    metric: 'avg_ticket', groupBy: 'hour',
    window: { from: T.parseDay('2026-09-28')!, to: T.endOfDay(T.parseDay('2026-09-28')!) },
    now, T, byHour: new Map()
  });
  if (!day.ok || !hour.ok) ok('histori kosong tanpa NaN', false);
  else {
    results.push(day, hour);
    ok('histori kosong tanpa NaN', day.data.rows.every((r) => r.value === 0) && hour.data.rows.length === 0 && finiteDeep([day, hour]));
  }
}

ok('semua hasil finite', results.every(finiteDeep));

if (failed) process.exit(1);

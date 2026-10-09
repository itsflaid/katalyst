import {
  comparableWindow,
  resolveNamedPeriod,
  spanLabel,
  type NamedPeriodKey
} from '../src/lib/shared/period';
import type { BizTz } from '../src/lib/shared/time';

let failed = 0;
function ok(label: string, pass: boolean) {
  console.log(`  ${pass ? '\x1b[32mPASS' : '\x1b[31mFAIL'}\x1b[0m  ${label}`);
  if (!pass) failed++;
}

const OFFSET: Record<BizTz, number> = { 'Asia/Jakarta': 7, 'Asia/Makassar': 8, 'Asia/Jayapura': 9 };
function at(tz: BizTz, day: string, time: string): Date {
  const [y, mo, d] = day.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - OFFSET[tz] * 3600_000);
}
function endOf(tz: BizTz, day: string): Date {
  return new Date(at(tz, day, '23:59').getTime() + 59_999);
}

const TZS: BizTz[] = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'];
const keys: NamedPeriodKey[] = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_30d'];

for (const tz of TZS) {
  const now = at(tz, '2026-10-04', '08:19');
  const table: Record<NamedPeriodKey, [Date, Date, Date, Date]> = {
    today: [at(tz, '2026-10-04', '00:00'), now, at(tz, '2026-10-03', '00:00'), at(tz, '2026-10-03', '08:19')],
    yesterday: [at(tz, '2026-10-03', '00:00'), endOf(tz, '2026-10-03'), at(tz, '2026-10-02', '00:00'), endOf(tz, '2026-10-02')],
    this_week: [at(tz, '2026-09-28', '00:00'), now, at(tz, '2026-09-21', '00:00'), at(tz, '2026-09-27', '08:19')],
    last_week: [at(tz, '2026-09-21', '00:00'), endOf(tz, '2026-09-27'), at(tz, '2026-09-14', '00:00'), endOf(tz, '2026-09-20')],
    this_month: [at(tz, '2026-10-01', '00:00'), now, at(tz, '2026-09-01', '00:00'), at(tz, '2026-09-04', '08:19')],
    last_month: [at(tz, '2026-09-01', '00:00'), endOf(tz, '2026-09-30'), at(tz, '2026-08-01', '00:00'), endOf(tz, '2026-08-31')],
    last_30d: [at(tz, '2026-09-05', '00:00'), now, at(tz, '2026-08-06', '15:41'), endOf(tz, '2026-09-04')],
    custom: [at(tz, '2026-09-05', '00:00'), now, at(tz, '2026-08-06', '15:41'), endOf(tz, '2026-09-04')]
  };
  for (const key of keys) {
    const [curFrom, curTo, baseFrom, baseTo] = table[key];
    const w = resolveNamedPeriod(key, tz, now);
    ok(`${tz} ${key}: jendela berjalan`, w.from?.getTime() === curFrom.getTime() && w.to?.getTime() === curTo.getTime());
    const b = comparableWindow({ from: w.from!, to: w.to!, key }, tz, now);
    ok(
      `${tz} ${key}: jendela pembanding`,
      b.from.getTime() === baseFrom.getTime() && b.to.getTime() === baseTo.getTime() && b.clamped === false
    );
  }
}

{
  const tz: BizTz = 'Asia/Makassar';
  const now = at(tz, '2026-03-31', '10:00');
  const w = resolveNamedPeriod('this_month', tz, now);
  const b = comparableWindow({ from: w.from!, to: w.to!, key: 'this_month' }, tz, now);
  ok(
    'bulan pendek memotong pembanding',
    b.from.getTime() === at(tz, '2026-02-01', '00:00').getTime() &&
      b.to.getTime() === endOf(tz, '2026-02-28').getTime() &&
      b.clamped === true
  );
}

{
  const tz: BizTz = 'Asia/Makassar';
  const monday = at(tz, '2026-09-28', '00:00');
  let thrown = false;
  try {
    const w = resolveNamedPeriod('this_week', tz, monday);
    const b = comparableWindow({ from: w.from!, to: w.to!, key: 'this_week' }, tz, monday);
    thrown = b.from.getTime() !== at(tz, '2026-09-21', '00:00').getTime();
  } catch {
    thrown = true;
  }
  ok('tepat Senin 00:00 tidak melempar', !thrown);
}

{
  const tz: BizTz = 'Asia/Makassar';
  const now = at(tz, '2026-10-04', '08:19');
  const w = resolveNamedPeriod('this_month', tz, now);
  const b = comparableWindow({ from: w.from!, to: w.to!, key: 'this_month' }, tz, now);
  ok('label memuat tanggal nyata', spanLabel(b.from, b.to, tz) === '1–4 Sep 2026 (sampai jam 08.19)');
  const y = resolveNamedPeriod('yesterday', tz, now);
  ok('label sehari penuh tanpa jam', spanLabel(y.from!, y.to!, tz) === '3 Okt 2026');
  const c = resolveNamedPeriod('custom', tz, now, { from: '2026-09-01', to: '2026-09-10' });
  ok(
    'custom tetap seperti semula',
    c.from?.getTime() === at(tz, '2026-09-01', '00:00').getTime() && c.to?.getTime() === endOf(tz, '2026-09-10').getTime()
  );
  const bad = resolveNamedPeriod('custom', tz, now, { from: 'asal', to: '2026-09-10' });
  ok('custom tak valid ditolak', bad.from === null && bad.to === null);
}

for (const tz of TZS) {
  const now = at(tz, '2026-10-04', '08:19');
  const cases: { key: NamedPeriodKey; fromDay: string; label: string }[] = [
    { key: 'last_7d', fromDay: '2026-09-28', label: '7 hari terakhir' },
    { key: 'last_90d', fromDay: '2026-07-07', label: '90 hari terakhir' }
  ];
  for (const { key, fromDay, label } of cases) {
    const w = resolveNamedPeriod(key, tz, now);
    ok(
      `${tz} ${key}: jendela berjalan`,
      w.from?.getTime() === at(tz, fromDay, '00:00').getTime() && w.to?.getTime() === now.getTime() && w.label === label
    );
    const b = comparableWindow({ from: w.from!, to: w.to!, key }, tz, now);
    const dur = w.to!.getTime() - w.from!.getTime();
    ok(
      `${tz} ${key}: pembanding menempel sama panjang`,
      b.to.getTime() === w.from!.getTime() - 1 && b.from.getTime() === w.from!.getTime() - dur && b.clamped === false
    );
  }
}

if (failed) process.exit(1);

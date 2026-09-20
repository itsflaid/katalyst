// Verifikasi helper WITA (src/lib/time.ts) + unit uang adaptif (src/lib/format.ts).
// Ikuti pola script/verify-engine.ts: hitung pass/fail, exit 1 kalau ada gagal.
import {
  TZ,
  toWita,
  startOfDayWita,
  endOfDayWita,
  addDaysWita,
  dayKeyWita,
  parseDayWita,
  isoDowWita,
  fmtWita
} from '../src/lib/shared/time';
import { pickMoneyUnit } from '../src/lib/shared/format';

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

console.log('\n== time.ts: konversi WITA ==');

// 2026-09-14T23:30:00Z = 15 Sep 07:30 WITA → hari WITA 2026-09-15.
ok('23:30Z → hari WITA 2026-09-15', dayKeyWita(new Date('2026-09-14T23:30:00Z')) === '2026-09-15');
// 2026-09-14T15:00:00Z = 14 Sep 23:00 WITA → hari 2026-09-14, jam dinding 23.
const w = toWita(new Date('2026-09-14T15:00:00Z'));
ok('15:00Z → hari WITA 2026-09-14', dayKeyWita(new Date('2026-09-14T15:00:00Z')) === '2026-09-14');
ok('15:00Z → jam dinding WITA 23', w.getUTCHours() === 23);

// Batas hari: 00:00 WITA = 16:00Z hari sebelumnya.
const start = startOfDayWita(new Date('2026-09-15T12:00:00Z'));
ok('startOfDayWita 15 Sep = 2026-09-14T16:00:00Z', start.toISOString() === '2026-09-14T16:00:00.000Z');
const end = endOfDayWita(new Date('2026-09-15T12:00:00Z'));
ok('endOfDayWita 15 Sep = 2026-09-15T15:59:59.999Z', end.toISOString() === '2026-09-15T15:59:59.999Z');

// addDaysWita: +1 hari dari start = start hari berikutnya.
ok('addDaysWita +1 hari', addDaysWita(start, 1).toISOString() === '2026-09-15T16:00:00.000Z');

// parseDayWita valid + invalid.
const parsed = parseDayWita('2026-09-15');
ok("parseDayWita('2026-09-15') → 2026-09-14T16:00Z", parsed?.toISOString() === '2026-09-14T16:00:00.000Z');
ok("parseDayWita('2026-02-30') → null", parseDayWita('2026-02-30') === null);
ok("parseDayWita('asal') → null", parseDayWita('asal') === null);

// isoDow: Senin 2026-09-14 → 1, Minggu 2026-09-20 → 7.
ok('isoDow Senin = 1', isoDowWita(new Date('2026-09-14T00:00:00Z')) === 1);
ok('isoDow Minggu = 7', isoDowWita(new Date('2026-09-20T00:00:00Z')) === 7);

// fmtWita pakai TZ Asia/Makassar.
ok('TZ = Asia/Makassar', TZ === 'Asia/Makassar');
const fmt = fmtWita(new Date('2026-09-14T15:00:00Z'), { hour: '2-digit', minute: '2-digit' });
ok('fmtWita 15:00Z → 23.00', /23[.:]00/.test(fmt), fmt);

console.log('\n== format.ts: unit uang adaptif ==');
ok('999 → rp', pickMoneyUnit(999).key === 'rp');
ok('250_000 → rb', pickMoneyUnit(250_000).key === 'rb');
ok('3_400_000 → jt', pickMoneyUnit(3_400_000).key === 'jt');

console.log(`\n${passCount} passed, ${failCount} failed\n`);
if (failCount > 0) process.exit(1);

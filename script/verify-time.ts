// Verifikasi helper zona bisnis (src/lib/shared/time.ts) + unit uang adaptif.
// Ikuti pola script/verify-engine.ts: hitung pass/fail, exit 1 kalau ada gagal.
import { makeTime, isBizTz, DEFAULT_TZ } from '../src/lib/shared/time';
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

// Aserti lama dipertahankan sebagai makeTime('Asia/Makassar') = bukti tanpa regresi.
const WITA = makeTime('Asia/Makassar');
console.log('\n== time.ts: kompatibilitas WITA (Makassar) ==');
ok('23:30Z → hari WITA 2026-09-15', WITA.dayKey(new Date('2026-09-14T23:30:00Z')) === '2026-09-15');
const w = WITA.toLocal(new Date('2026-09-14T15:00:00Z'));
ok('15:00Z → hari WITA 2026-09-14', WITA.dayKey(new Date('2026-09-14T15:00:00Z')) === '2026-09-14');
ok('15:00Z → jam dinding WITA 23', w.getUTCHours() === 23);
const start = WITA.startOfDay(new Date('2026-09-15T12:00:00Z'));
ok('startOfDay 15 Sep = 2026-09-14T16:00:00Z', start.toISOString() === '2026-09-14T16:00:00.000Z');
const end = WITA.endOfDay(new Date('2026-09-15T12:00:00Z'));
ok('endOfDay 15 Sep = 2026-09-15T15:59:59.999Z', end.toISOString() === '2026-09-15T15:59:59.999Z');
ok('addDays +1 hari', WITA.addDays(start, 1).toISOString() === '2026-09-15T16:00:00.000Z');
const parsed = WITA.parseDay('2026-09-15');
ok("parseDay('2026-09-15') → 2026-09-14T16:00Z", parsed?.toISOString() === '2026-09-14T16:00:00.000Z');
ok("parseDay('2026-02-30') → null", WITA.parseDay('2026-02-30') === null);
ok("parseDay('asal') → null", WITA.parseDay('asal') === null);
ok('isoDow Senin = 1', WITA.isoDow(new Date('2026-09-14T00:00:00Z')) === 1);
ok('isoDow Minggu = 7', WITA.isoDow(new Date('2026-09-20T00:00:00Z')) === 7);
ok('DEFAULT_TZ = Asia/Makassar', DEFAULT_TZ === 'Asia/Makassar');
const fmt = WITA.fmt(new Date('2026-09-14T15:00:00Z'), { hour: '2-digit', minute: '2-digit' });
ok('fmt 15:00Z → 23.00', /23[.:]00/.test(fmt), fmt);

console.log('\n== time.ts: matriks 3 zona ==');
const WIB = makeTime('Asia/Jakarta');
const WIT = makeTime('Asia/Jayapura');
const d1 = new Date('2026-09-29T16:30:00Z');
ok('dayKey 16:30Z WIB=2026-09-29', WIB.dayKey(d1) === '2026-09-29', WIB.dayKey(d1));
ok('dayKey 16:30Z WITA=2026-09-30', WITA.dayKey(d1) === '2026-09-30', WITA.dayKey(d1));
ok('dayKey 16:30Z WIT=2026-09-30', WIT.dayKey(d1) === '2026-09-30', WIT.dayKey(d1));
const d2 = new Date('2026-09-29T17:30:00Z');
ok('dayKey 17:30Z WIB=2026-09-30', WIB.dayKey(d2) === '2026-09-30', WIB.dayKey(d2));
ok('dayKey 17:30Z WITA=2026-09-30', WITA.dayKey(d2) === '2026-09-30', WITA.dayKey(d2));
ok('dayKey 17:30Z WIT=2026-09-30', WIT.dayKey(d2) === '2026-09-30', WIT.dayKey(d2));
const hm = { hour: '2-digit', minute: '2-digit' } as const;
ok('fmt 16:30Z WIB=23.30', /23[.:]30/.test(WIB.fmt(d1, hm)), WIB.fmt(d1, hm));
ok('fmt 16:30Z WITA=00.30', /00[.:]30/.test(WITA.fmt(d1, hm)), WITA.fmt(d1, hm));
ok('fmt 16:30Z WIT=01.30', /01[.:]30/.test(WIT.fmt(d1, hm)), WIT.fmt(d1, hm));
ok('isoDow 16:30Z WIB=2', WIB.isoDow(d1) === 2, String(WIB.isoDow(d1)));
ok('isoDow 16:30Z WITA=3', WITA.isoDow(d1) === 3, String(WITA.isoDow(d1)));
ok('isoDow 16:30Z WIT=3', WIT.isoDow(d1) === 3, String(WIT.isoDow(d1)));
const d3 = new Date('2026-09-29T12:00:00Z');
ok('startOfDay WIB', WIB.startOfDay(d3).toISOString() === '2026-09-28T17:00:00.000Z', WIB.startOfDay(d3).toISOString());
ok('startOfDay WITA', WITA.startOfDay(d3).toISOString() === '2026-09-28T16:00:00.000Z', WITA.startOfDay(d3).toISOString());
ok('startOfDay WIT', WIT.startOfDay(d3).toISOString() === '2026-09-28T15:00:00.000Z', WIT.startOfDay(d3).toISOString());
ok('endOfDay WIB', WIB.endOfDay(d3).toISOString() === '2026-09-29T16:59:59.999Z', WIB.endOfDay(d3).toISOString());
ok('endOfDay WITA', WITA.endOfDay(d3).toISOString() === '2026-09-29T15:59:59.999Z', WITA.endOfDay(d3).toISOString());
ok('endOfDay WIT', WIT.endOfDay(d3).toISOString() === '2026-09-29T14:59:59.999Z', WIT.endOfDay(d3).toISOString());
ok('parseDay WIB', WIB.parseDay('2026-09-30')?.toISOString() === '2026-09-29T17:00:00.000Z', WIB.parseDay('2026-09-30')?.toISOString() ?? 'null');
ok('parseDay WITA', WITA.parseDay('2026-09-30')?.toISOString() === '2026-09-29T16:00:00.000Z', WITA.parseDay('2026-09-30')?.toISOString() ?? 'null');
ok('parseDay WIT', WIT.parseDay('2026-09-30')?.toISOString() === '2026-09-29T15:00:00.000Z', WIT.parseDay('2026-09-30')?.toISOString() ?? 'null');

ok("isBizTz('Asia/Tokyo') === false", isBizTz('Asia/Tokyo') === false);
let threw = false;
try {
  makeTime('Asia/Tokyo' as never);
} catch {
  threw = true;
}
ok('makeTime(Tokyo) melempar', threw);
ok("parseDay('2026-02-30') === null", WITA.parseDay('2026-02-30') === null);

console.log('\n== format.ts: unit uang adaptif ==');
ok('999 → rp', pickMoneyUnit(999).key === 'rp');
ok('250_000 → rb', pickMoneyUnit(250_000).key === 'rb');
ok('3_400_000 → jt', pickMoneyUnit(3_400_000).key === 'jt');

console.log(`\n${passCount} passed, ${failCount} failed\n`);
if (failCount > 0) process.exit(1);

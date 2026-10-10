// Verifikasi modul src/lib/discount.ts: 17 kasus angka + properti 200 iterasi.
import { calculateCart, type CartLineIn, type DiscountLike, unitDiscount, getDiscountStatus, remainingQuota, isBelowCost, resolveWindow, type WindowPreset, quotaDeltas } from '../src/lib/discount';
import { EXCLUSION_VIOLATION, overlapDbMessage } from '../src/lib/server/domains/discounts/errors';
import { makeTime, type BizTime } from '../src/lib/shared/time';

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

console.log('\n== discount.ts: unitDiscount ==');

ok('unitDiscount(15000,15)', unitDiscount(15000, 15) === 2250);
ok('unitDiscount(10000,15)', unitDiscount(10000, 15) === 1500);
ok('unitDiscount(12345,15)', unitDiscount(12345, 15) === 1852);
ok('unitDiscount(10,5)', unitDiscount(10, 5) === 1);
ok('unitDiscount(999,100)', unitDiscount(999, 100) === 999);

console.log('\n== discount.ts: diskon produk ACTIVE ==');

const now = new Date('2026-09-30T12:00:00.000Z');
const T = makeTime('Asia/Makassar');

const prodDisc: DiscountLike = {
  id: 'd1',
  name: 'Diskon 15%',
  scope: 'PRODUCT',
  percent: 15,
  productId: 'p1',
  isActive: true,
  startsAt: new Date(now.getTime() - 3600_000),
  endsAt: new Date(now.getTime() + 3600_000),
  quota: null,
  quotaUsed: 0,
  createdAt: new Date(now.getTime() - 7200_000)
};

const cart2: CartLineIn[] = [{ productId: 'p1', qty: 3, price: 10000 }];
const cart2Out = calculateCart(cart2, { productDiscounts: [prodDisc], global: null, now });
ok('kuota null, qty=3, harga=10000, 15% → amount=4500, net=25500', cart2Out.lines[0].discountAmount === 4500 && cart2Out.lines[0].net === 25500);

const prodDiscQuota: DiscountLike = { ...prodDisc, id: 'd2', quota: 5, quotaUsed: 0 };
const cart3: CartLineIn[] = [{ productId: 'p1', qty: 8, price: 10000 }];
const cart3Out = calculateCart(cart3, { productDiscounts: [prodDiscQuota], global: null, now });
ok('quota=5, used=0, qty=8 → discountedQty=5, amount=7500, partial=true, net=72500', cart3Out.lines[0].discountedQty === 5 && cart3Out.lines[0].discountAmount === 7500 && cart3Out.lines[0].partial === true && cart3Out.lines[0].net === 72500);

const prodDiscQuota2: DiscountLike = { ...prodDisc, id: 'd3', quota: 100, quotaUsed: 98 };
const cart4: CartLineIn[] = [{ productId: 'p1', qty: 5, price: 10000 }];
const cart4Out = calculateCart(cart4, { productDiscounts: [prodDiscQuota2], global: null, now });
ok('quota=100, used=98, qty=5 → discountedQty=2, amount=3000, net=47000', cart4Out.lines[0].discountedQty === 2 && cart4Out.lines[0].discountAmount === 3000 && cart4Out.lines[0].net === 47000);

const prodDiscSoldOut: DiscountLike = { ...prodDisc, id: 'd4', quota: 5, quotaUsed: 5 };
const cart5: CartLineIn[] = [{ productId: 'p1', qty: 3, price: 10000 }];
const cart5Out = calculateCart(cart5, { productDiscounts: [prodDiscSoldOut], global: null, now });
ok('quota=5, used=5 (SOLD_OUT) → no discount', cart5Out.lines[0].discountId === null);

console.log('\n== discount.ts: status diskon ==');

const futureDisc: DiscountLike = { ...prodDisc, id: 'd5', startsAt: new Date(now.getTime() + 3600_000), endsAt: null, quota: null, quotaUsed: 0 };
const scheduled = getDiscountStatus(futureDisc, now);
ok('startsAt masa depan → SCHEDULED', scheduled === 'SCHEDULED');

const exactEndDisc: DiscountLike = { ...prodDisc, id: 'd6', startsAt: new Date(now.getTime() - 3600_000), endsAt: now, quota: null, quotaUsed: 0 };
const activeAtEnd = getDiscountStatus(exactEndDisc, now);
ok('now == endsAt → ACTIVE', activeAtEnd === 'ACTIVE');

const afterEndDisc: DiscountLike = { ...prodDisc, id: 'd7', startsAt: new Date(now.getTime() - 3600_000), endsAt: new Date(now.getTime() - 1), quota: null, quotaUsed: 0 };
const expired = getDiscountStatus(afterEndDisc, now);
ok('now == endsAt+1ms → EXPIRED', expired === 'EXPIRED');

const inactiveDisc: DiscountLike = { ...prodDisc, id: 'd8', isActive: false, startsAt: new Date(now.getTime() - 7200_000), endsAt: new Date(now.getTime() - 3600_000), quota: null, quotaUsed: 5 };
const inactiveStatus = getDiscountStatus(inactiveDisc, now);
ok('isActive=false + expired → INACTIVE', inactiveStatus === 'INACTIVE');

const soldOutThenExpired: DiscountLike = { ...prodDisc, id: 'd9', isActive: true, startsAt: new Date(now.getTime() - 7200_000), endsAt: new Date(now.getTime() - 3600_000), quota: 5, quotaUsed: 10 };
const soldOutStatus = getDiscountStatus(soldOutThenExpired, now);
ok('expired + sold out → EXPIRED', soldOutStatus === 'EXPIRED');

console.log('\n== discount.ts: prioritas PRODUCT vs GLOBAL ==');

const globalDisc: DiscountLike = {
  id: 'g1',
  name: 'Global 10%',
  scope: 'GLOBAL',
  percent: 10,
  productId: null,
  isActive: true,
  startsAt: new Date(now.getTime() - 3600_000),
  endsAt: new Date(now.getTime() + 3600_000),
  quota: null,
  quotaUsed: 0,
  createdAt: new Date(now.getTime() - 7200_000)
};

const lines8: CartLineIn[] = [
  { productId: 'p1', qty: 2, price: 10000 },
  { productId: 'p2', qty: 1, price: 20000 }
];
const cart8Out = calculateCart(lines8, { productDiscounts: [prodDisc], global: globalDisc, now });
ok('A=PRODUCT, B=GLOBAL', cart8Out.lines[0].source === 'PRODUCT' && cart8Out.lines[1].source === 'GLOBAL');

const cart9Out = calculateCart(lines8, { productDiscounts: [prodDiscSoldOut], global: globalDisc, now });
ok('PRODUCT SOLD_OUT → GLOBAL', cart9Out.lines[0].source === 'GLOBAL' && cart9Out.lines[0].discountedQty === 2);

const cart10Out = calculateCart([{ productId: 'p1', qty: 8, price: 10000 }], { productDiscounts: [prodDiscQuota], global: globalDisc, now });
ok('PRODUCT kuota habis → global tidak menyentuh baris', cart10Out.lines[0].source === 'PRODUCT' && cart10Out.lines[0].discountedQty === 5 && cart10Out.lines[0].discountPercent === 15);

const cart11Out = calculateCart(lines8, { productDiscounts: [prodDisc], global: null, now });
ok('global=null → tanpa diskon global', cart11Out.lines[1].source === null);

const newerDisc: DiscountLike = { ...prodDisc, id: 'd12', createdAt: new Date(now.getTime() - 1800_000), startsAt: new Date(now.getTime() - 3600_000), endsAt: new Date(now.getTime() + 3600_000) };
const cart12Out = calculateCart([{ productId: 'p1', qty: 3, price: 10000 }], { productDiscounts: [prodDisc, newerDisc], global: null, now });
ok('dua diskon produk → createdAt terbaru menang', cart12Out.lines[0].discountId === 'd12' && cart12Out.lines[0].discountPercent === 15);

console.log('\n== discount.ts: guard rugi ==');

ok('isBelowCost(10000,8000,25)', isBelowCost(10000, 8000, 25) === true);
ok('isBelowCost(10000,8000,20)', isBelowCost(10000, 8000, 20) === false);

const cart14Out = calculateCart([
  { productId: 'p1', qty: 5, price: 10000 },
  { productId: 'p2', qty: 2, price: 20000 }
], { productDiscounts: [prodDiscQuota], global: globalDisc, now });
const deltas14 = quotaDeltas(cart14Out);
ok('quotaDeltas: satu entri per discountId', deltas14.length === 2);
ok('quotaDeltas: units benar', deltas14.find(d => d.discountId === prodDiscQuota.id)?.units === 5 && deltas14.find(d => d.discountId === globalDisc.id)?.units === 2);

console.log('\n== discount.ts: resolveWindow ==');

const testNow = new Date('2026-09-29T07:00:00.000Z');
const wib = makeTime('Asia/Jakarta');
const wita = makeTime('Asia/Makassar');
const wit = makeTime('Asia/Jayapura');

// Bandingkan ISO persis (milidetik ikut dihitung).
const iso = (d: Date) => d.toISOString();
// Narrowing union hasil resolveWindow (TS tidak menyempitkan via &&).
type Win = { startsAt: Date; endsAt: Date | null };
const win = (v: Win | { error: string }): Win => {
  if (!('startsAt' in v)) throw new Error('bukan window: ' + (v as { error: string }).error);
  return v;
};
const winErr = (v: Win | { error: string }): string => {
  if (!('error' in v)) throw new Error('bukan error');
  return v.error;
};

ok('WIB TODAY endsAt', iso(win(resolveWindow('TODAY', testNow, wib)).endsAt as Date) === '2026-09-29T16:59:59.999Z');
ok('WITA TODAY endsAt', iso(win(resolveWindow('TODAY', testNow, wita)).endsAt as Date) === '2026-09-29T15:59:59.999Z');
ok('WIT TODAY endsAt', iso(win(resolveWindow('TODAY', testNow, wit)).endsAt as Date) === '2026-09-29T14:59:59.999Z');
ok('WITA DAYS_7 endsAt', iso(win(resolveWindow('DAYS_7', testNow, wita)).endsAt as Date) === '2026-10-05T15:59:59.999Z');
ok('WITA DAYS_2 endsAt', iso(win(resolveWindow('DAYS_2', testNow, wita)).endsAt as Date) === '2026-09-30T15:59:59.999Z');

const custom2 = win(resolveWindow('DAYS_2', testNow, wita, { startDay: '2026-10-01' }));
ok('startDay=2026-10-01, DAYS_2 → startsAt=2026-09-30T16:00:00, endsAt=2026-10-02T15:59:59', iso(custom2.startsAt) === '2026-09-30T16:00:00.000Z' && iso(custom2.endsAt as Date) === '2026-10-02T15:59:59.999Z');

ok('TODAY tanpa startDay → startsAt = now', win(resolveWindow('TODAY', testNow, wita)).startsAt.getTime() === testNow.getTime());

ok('parseDay invalid', winErr(resolveWindow('TODAY', testNow, wita, { startDay: '2026-02-30' })) === 'Tanggal mulai tidak valid.');
ok('parseDay masa lalu', winErr(resolveWindow('TODAY', testNow, wita, { startDay: '2026-09-28' })) === 'Tanggal mulai tidak boleh di masa lalu.');
ok('CUSTOM tanpa endDay', winErr(resolveWindow('CUSTOM', testNow, wita, { startDay: '2026-10-01' })) === 'Tanggal akhir tidak boleh kosong untuk preset CUSTOM.');
ok('CUSTOM endDay invalid', winErr(resolveWindow('CUSTOM', testNow, wita, { startDay: '2026-10-01', endDay: '2026-02-30' })) === 'Tanggal akhir tidak valid.');
ok('CUSTOM endDay < startDay', winErr(resolveWindow('CUSTOM', testNow, wita, { startDay: '2026-10-01', endDay: '2026-09-30' })) === 'Tanggal akhir tidak boleh sebelum tanggal mulai.');

console.log('\n== discount.ts: properti (200 iterasi) ==');

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let propsPass = 0;
let propsFail = 0;
for (let i = 0; i < 200; i++) {
  const rng = mulberry32(12345 + i);
  const qty = Math.floor(rng() * 5) + 1;
  const price = Math.floor(rng() * 100000) + 1000;
  const percent = Math.floor(rng() * 99) + 1;
  const quota = Math.floor(rng() * 100);
  const used = Math.floor(rng() * quota);

  const d: DiscountLike = {
    id: `d${i}`,
    name: 'D',
    scope: 'PRODUCT',
    percent,
    productId: 'p1',
    isActive: true,
    startsAt: new Date('2026-01-01T00:00:00.000Z'),
    endsAt: new Date('2026-12-31T23:59:59.999Z'),
    quota,
    quotaUsed: used,
    createdAt: new Date('2026-01-01T00:00:00.000Z')
  };

  const linesIn: CartLineIn[] = [{ productId: 'p1', qty, price }];
  const cart = calculateCart(linesIn, { productDiscounts: [d], global: null, now });
  const line = cart.lines[0];

  if (cart.total !== cart.subtotal - cart.discountTotal) { propsFail++; continue; }
  if (line.discountedQty < 0 || line.discountedQty > qty) { propsFail++; continue; }
  if (line.discountAmount < 0 || line.discountAmount > line.gross) { propsFail++; continue; }
  if (cart.total < 0) { propsFail++; continue; }
  if (line.discountedQty === 0 && line.discountId !== null) { propsFail++; continue; }

  propsPass++;
}

ok('properti 200 iterasi', propsPass === 200, `${propsPass}/200`);

console.log('\n== overlap 23P01 ke pesan ==');

ok('kode benar + nama', overlapDbMessage({ code: '23P01' }, 'Promo A') === 'Rentang waktu bertabrakan dengan diskon "Promo A".');
ok('kode di cause + tanpa nama', overlapDbMessage({ cause: { code: '23P01' } }, null) === 'Rentang waktu bertabrakan dengan diskon lain untuk produk ini.');
ok('kode lain terus', overlapDbMessage({ code: '23505' }, 'Promo A') === null && overlapDbMessage(new Error('x'), null) === null);
ok('konstanta kode', EXCLUSION_VIOLATION === '23P01');

console.log(`\n${passCount} passed, ${failCount} failed\n`);
if (failCount > 0) process.exit(1);

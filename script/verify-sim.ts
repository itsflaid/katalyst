// Verifikasi simulator baru (src/lib/simulation.ts): identitas, kuota,
// paritas kasir, validasi, breakeven, diskon maks, nol histori, monotonik.
// Pola: ok() → PASS/FAIL, exit 1 bila ada FAIL. Acak pakai PRNG ber-seed,
// 200 iterasi seperti verify-discount.ts.
import {
  simulate,
  sanitizeLevers,
  simulateScenario,
  type SimInput
} from '../src/lib/simulation';
import { metricsOf, type Facts } from '../src/lib/analytics';
import { calculateCart, isBelowCost, unitDiscount, type DiscountLike } from '../src/lib/discount';

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
const rand = mulberry32(20261003);
const ri = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;

function randomBaseline(): { baseline: Facts; P: number; c: number } {
  const P = ri(1, 50) * 1000;
  const c = ri(1, P);
  const qty = ri(0, 500);
  const gross = qty * P;
  const discount = qty === 0 ? 0 : ri(0, gross);
  return {
    baseline: { qty, gross, discount, cost: qty * c, discountedQty: ri(0, qty) },
    P,
    c
  };
}

// S1: identitas — levers {} ⇒ simulated ≡ statusQuo.
console.log('\n== S1: identitas ==');
{
  let good = true;
  for (let it = 0; it < 200; it++) {
    const { baseline, P, c } = randomBaseline();
    const r = simulate({ baseline, product: { sellingPrice: P, costPrice: c }, levers: {} });
    if (JSON.stringify(r.simulated) !== JSON.stringify(r.statusQuo)) good = false;
  }
  ok('200 baseline acak: simulated ≡ statusQuo bila levers={}', good);
}

// S2: tanpa drift — statusQuo ≡ actual (tepat).
console.log('\n== S2: tanpa drift ==');
{
  let good = true;
  for (let it = 0; it < 200; it++) {
    const P = ri(1, 50) * 1000;
    const c = ri(1, P);
    const qty = ri(0, 200);
    const pct = ri(0, 50);
    const covered = ri(0, qty);
    const discount = covered * unitDiscount(P, pct);
    const baseline: Facts = { qty, gross: qty * P, discount, cost: qty * c, discountedQty: covered };
    const r = simulate({ baseline, product: { sellingPrice: P, costPrice: c }, levers: {} });
    if (r.statusQuo.revenue !== r.actual.revenue || r.statusQuo.cost !== r.actual.cost || r.statusQuo.profit !== r.actual.profit) {
      good = false;
    }
  }
  ok('200 baseline satu harga/modal: statusQuo ≡ actual', good);
}

// S3: repro §1.1 — 100 unit (40 kena diskon 20%) @10.000/6.000.
console.log('\n== S3: repro diskon kuota ==');
{
  const baseline: Facts = { qty: 100, gross: 1000000, discount: 80000, cost: 600000, discountedQty: 40 };
  const prod = { sellingPrice: 10000, costPrice: 6000 };
  const r0 = simulate({ baseline, product: prod, levers: {} });
  ok('aktual 920.000/320.000', r0.actual.revenue === 920000 && r0.actual.profit === 320000, `${r0.actual.revenue}/${r0.actual.profit}`);
  ok('levers={} ⇒ simulasi 920.000/320.000', r0.simulated.revenue === 920000 && r0.simulated.profit === 320000);
  ok('impact.vsStatusQuo.profit = 0', r0.impact.vsStatusQuo.profit === 0);
  const rAll = simulate({ baseline, product: prod, levers: { discount: { kind: 'percent', pct: 20 } } });
  ok('percent 20 semua unit ⇒ revenue 800.000', rAll.simulated.revenue === 800000, String(rAll.simulated.revenue));
  const rQuota = simulate({ baseline, product: prod, levers: { discount: { kind: 'percent', pct: 20, units: 40 } } });
  ok('percent 20 units 40 ⇒ revenue 920.000', rQuota.simulated.revenue === 920000, String(rQuota.simulated.revenue));
}

// S4: paritas kasir — revenue mode percent (+kuota) ≡ calculateCart.
console.log('\n== S4: paritas kasir ==');
{
  let good = true;
  for (let it = 0; it < 200; it++) {
    const P = ri(1, 50) * 1000;
    const c = ri(1, P);
    const pct = ri(1, 50);
    const qty = ri(1, 20);
    const useQuota = rand() < 0.5;
    const quota = useQuota ? ri(0, qty + 5) : null;
    const now = new Date('2026-09-15T10:00:00Z');
    const d: DiscountLike = {
      id: 'd', name: 'D', scope: 'PRODUCT', percent: pct, productId: 'p',
      isActive: true, startsAt: new Date('2026-09-01T00:00:00Z'),
      endsAt: new Date('2026-09-30T00:00:00Z'), quota, quotaUsed: 0, createdAt: now
    };
    const cart = calculateCart([{ productId: 'p', qty, price: P }], { productDiscounts: [d], global: null, now });
    const r = simulate({
      baseline: { qty, gross: qty * P, discount: 0, cost: qty * c, discountedQty: 0 },
      product: { sellingPrice: P, costPrice: c },
      levers: {
        discount: quota === null ? { kind: 'percent', pct } : { kind: 'percent', pct, units: quota },
        volume: { kind: 'override', qty }
      }
    });
    if (r.simulated.revenue !== cart.total) good = false;
  }
  ok('200 kombinasi: revenue ≡ calculateCart berkuota', good);
}

// S5: validasi RangeError + sanitizeLevers.
console.log('\n== S5: validasi ==');
{
  const base: Facts = { qty: 10, gross: 100000, discount: 0, cost: 60000, discountedQty: 0 };
  const prod = { sellingPrice: 10000, costPrice: 6000 };
  const throws = (label: string, fn: () => void) => {
    try {
      fn();
      ok(label, false, 'tidak melempar');
    } catch (e) {
      ok(label, e instanceof RangeError, String(e).slice(0, 80));
    }
  };
  throws('pct −1', () => simulate({ baseline: base, product: prod, levers: { discount: { kind: 'percent', pct: -1 } } }));
  throws('pct 101', () => simulate({ baseline: base, product: prod, levers: { discount: { kind: 'percent', pct: 101 } } }));
  throws('pct NaN', () => simulate({ baseline: base, product: prod, levers: { discount: { kind: 'percent', pct: NaN } } }));
  throws('pct 14.5', () => simulate({ baseline: base, product: prod, levers: { discount: { kind: 'percent', pct: 14.5 } } }));
  throws('price negatif', () => simulate({ baseline: base, product: prod, levers: { price: -1 } }));
  throws('cost NaN', () => simulate({ baseline: base, product: prod, levers: { cost: NaN } }));
  throws('units negatif', () => simulate({ baseline: base, product: prod, levers: { discount: { kind: 'percent', pct: 10, units: -2 } } }));
  throws('qty override Infinity', () =>
    simulate({ baseline: base, product: prod, levers: { volume: { kind: 'override', qty: Infinity } } }));
  const s = sanitizeLevers({ price: -3.4, cost: 6000.6, discount: { kind: 'percent', pct: 150.4, units: -2.2 }, volume: { kind: 'override', qty: 9.6 } });
  ok('sanitize clamp+round', s.price === 0 && s.cost === 6001 && s.discount?.kind === 'percent' && (s.discount as { pct: number }).pct === 100, JSON.stringify(s));
  let sanitizedOk = true;
  try {
    simulate({ baseline: base, product: prod, levers: s });
  } catch {
    sanitizedOk = false;
  }
  ok('hasil sanitize lolos simulate', sanitizedOk);
}

// S6: breakEvenQty.
console.log('\n== S6: breakEvenQty ==');
{
  const baseline: Facts = { qty: 100, gross: 1000000, discount: 80000, cost: 600000, discountedQty: 40 };
  const prod = { sellingPrice: 10000, costPrice: 6000 };
  // Skenario: harga naik ke 11.000, diskon keep → unitProfit > 0, target > 0.
  const input: SimInput = { baseline, product: prod, levers: { price: 11000 } };
  const r = simulate(input);
  const n = r.breakEvenQty;
  const profitAt = (q: number) =>
    simulate({ ...input, levers: { ...input.levers, volume: { kind: 'override', qty: q } } }).simulated.profit;
  ok('n bukan null', n !== null, String(n));
  if (n !== null) {
    ok('profitAt(n) ≥ target', profitAt(n) >= r.statusQuo.profit, `${profitAt(n)} vs ${r.statusQuo.profit}`);
    ok('n=0 atau profitAt(n−1) < target', n === 0 || profitAt(n - 1) < r.statusQuo.profit);
  }
  // unitProfit ≤ 0 ⇒ null (modal dinaikkan di atas harga net).
  const rugi = simulate({ baseline, product: prod, levers: { cost: 20000 } });
  ok('unitProfit ≤ 0 ⇒ null', rugi.breakEvenQty === null, String(rugi.breakEvenQty));
  // statusQuo.profit ≤ 0 ⇒ 0.
  const nol = simulate({
    baseline: { qty: 0, gross: 0, discount: 0, cost: 0, discountedQty: 0 },
    product: prod,
    levers: { volume: { kind: 'override', qty: 10 } }
  });
  ok('statusQuo.profit ≤ 0 ⇒ 0', nol.breakEvenQty === 0, String(nol.breakEvenQty));
}

// S7: maxDiscountPct.
console.log('\n== S7: maxDiscountPct ==');
{
  let good = true;
  for (let it = 0; it < 50; it++) {
    const P = ri(2, 50) * 1000;
    const c = ri(1, P - 1);
    const r = simulate({
      baseline: { qty: 10, gross: 10 * P, discount: 0, cost: 10 * c, discountedQty: 0 },
      product: { sellingPrice: P, costPrice: c },
      levers: {}
    });
    const m = r.maxDiscountPct;
    if (m === null || !Number.isInteger(m)) { good = false; continue; }
    if (isBelowCost(P, c, m)) good = false;
    if (m < 100 && !isBelowCost(P, c, m + 1)) good = false;
  }
  ok('50 harga acak: !isBelowCost(m), isBelowCost(m+1)', good);
  const below = simulate({
    baseline: { qty: 10, gross: 100000, discount: 0, cost: 60000, discountedQty: 0 },
    product: { sellingPrice: 10000, costPrice: 6000 },
    levers: { cost: 12000 }
  });
  ok("P' < c' ⇒ 0", below.maxDiscountPct === 0, String(below.maxDiscountPct));
  const nol = simulate({
    baseline: { qty: 10, gross: 100000, discount: 0, cost: 60000, discountedQty: 0 },
    product: { sellingPrice: 10000, costPrice: 6000 },
    levers: { price: 0 }
  });
  ok("P' ≤ 0 ⇒ null", nol.maxDiscountPct === null, String(nol.maxDiscountPct));
}

// S8: nol histori — finite + NO_HISTORY + impact null dari nol.
console.log('\n== S8: nol histori ==');
{
  const r = simulate({
    baseline: { qty: 0, gross: 0, discount: 0, cost: 0, discountedQty: 0 },
    product: { sellingPrice: 10000, costPrice: 6000 },
    levers: { volume: { kind: 'override', qty: 50 } }
  });
  ok('flag NO_HISTORY', r.flags.includes('NO_HISTORY'));
  const nums = [r.actual.revenue, r.actual.profit, r.statusQuo.revenue, r.simulated.revenue, r.simulated.profit,
    r.simulated.margin, r.unit.unitProfit, r.drift.price, r.drift.cost, r.impact.vsStatusQuo.marginPoints];
  ok('semua angka finite', nums.every(Number.isFinite), JSON.stringify(nums));
  ok('impact dari nol = null', r.impact.vsStatusQuo.revenue === null && r.impact.vsStatusQuo.profit === null);
}

// S9: monotonik — pct naik ⇒ revenue tak naik.
console.log('\n== S9: monotonik diskon ==');
{
  let good = true;
  for (let it = 0; it < 200; it++) {
    const { baseline, P, c } = randomBaseline();
    let prev = Infinity;
    for (let pct = 0; pct <= 100; pct += 7) {
      const r = simulate({ baseline, product: { sellingPrice: P, costPrice: c }, levers: { discount: { kind: 'percent', pct } } });
      if (r.simulated.revenue > prev) { good = false; break; }
      prev = r.simulated.revenue;
    }
  }
  ok('200 baseline: revenue monoton turun terhadap pct', good);
}

// S10: keep + volume — diskon ikut skala + flag.
console.log('\n== S10: keep + volume ==');
{
  const baseline: Facts = { qty: 100, gross: 1000000, discount: 80000, cost: 600000, discountedQty: 40 };
  const r = simulate({
    baseline,
    product: { sellingPrice: 10000, costPrice: 6000 },
    levers: { volume: { kind: 'pct', pct: 25 } }
  });
  ok('diskon ikut skala (100.000 tepat)', r.simulated.discount === 100000, String(r.simulated.discount));
  ok('flag PROMO_SCALED_WITH_VOLUME', r.flags.includes('PROMO_SCALED_WITH_VOLUME'));
  // Kasus acak: definisi keep = round(gross_sim × rate).
  let good = true;
  for (let it = 0; it < 200; it++) {
    const { baseline: b, P, c } = randomBaseline();
    const pct = ri(-50, 100);
    const rr = simulate({ baseline: b, product: { sellingPrice: P, costPrice: c }, levers: { volume: { kind: 'pct', pct } } });
    const rate = metricsOf(b).discountRate;
    if (rr.simulated.discount !== Math.round(rr.simulated.gross * rate)) good = false;
    if (pct !== 0 && !rr.flags.includes('PROMO_SCALED_WITH_VOLUME')) good = false;
  }
  ok('200 kasus: definisi keep + flag konsisten', good);
}

// S11: adapter lama T1–T3 (cakupan verify-engine).
console.log('\n== S11: adapter simulateScenario ==');
{
  const kopiA = { id: 'kopi-a', name: 'Kopi A', costPrice: 6000, sellingPrice: 10000 };
  const hist = [{ productId: 'kopi-a', quantity: 500, priceAtSale: 10000, costAtSale: 6000 }];
  const t1 = simulateScenario(kopiA, hist, { newSellingPrice: 12000 });
  ok('T1 revenue 6jt', t1.simulated.revenue === 6000000, String(t1.simulated.revenue));
  ok('T1 profit 3jt +50%', t1.simulated.profit === 3000000 && Math.abs(t1.impact.profitChangePercent - 0.5) < 0.001);
  const t2 = simulateScenario(kopiA, hist, { discountPercent: 0.1 });
  ok('T2 revenue 4,5jt', t2.simulated.revenue === 4500000, String(t2.simulated.revenue));
  ok('T2 profit 1,5jt −25%', t2.simulated.profit === 1500000 && Math.abs(t2.impact.profitChangePercent + 0.25) < 0.001);
  const t3 = simulateScenario(kopiA, hist, { newCostPrice: 6600 });
  ok('T3 revenue 5jt', t3.simulated.revenue === 5000000, String(t3.simulated.revenue));
  ok('T3 profit 1,7jt −15%', t3.simulated.profit === 1700000 && Math.abs(t3.impact.profitChangePercent + 0.15) < 0.001);
}

console.log(`\n${passCount} passed, ${failCount} failed\n`);
if (failCount > 0) process.exit(1);

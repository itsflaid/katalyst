// Verifikasi simulator: identitas, kuota, paritas kasir, validasi, breakeven,
// diskon maks, nol histori, monotonik. PRNG ber-seed, 200 iterasi; exit 1 bila FAIL.
import {
  simulate,
  sanitizeLevers,
  simulateScenario,
  assessScenario,
  sensitivityBand,
  robustnessOf,
  dropFromElasticity,
  elasticityFromDrop,
  SENSITIVITY_LEVELS,
  DEMAND_MAX_FACTOR,
  DEMAND_MAX_ELASTICITY,
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

// S1: identitas, levers {} ⇒ simulated ≡ statusQuo.
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

// S2: tanpa drift, statusQuo ≡ actual (tepat).
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

// S3: repro diskon kuota, 100 unit (40 kena diskon 20%) @10.000/6.000.
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

// S4: paritas kasir, revenue mode percent (+kuota) ≡ calculateCart.
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

// S8: nol histori, finite + NO_HISTORY + impact null dari nol.
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

// S9: monotonik, pct naik ⇒ revenue tak naik.
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

// S10: keep + volume, diskon ikut skala + flag.
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

// S11: adapter simulateScenario (cakupan verify-engine).
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

// S12: respons permintaan, elastisitas, plafon, jangkauan, puncak, penilaian.
console.log('\n== S12: respons permintaan ==');
{
  // Baseline acuan: qty 100, tanpa diskon histori; profit sekarang 400.000.
  const baseline: Facts = { qty: 100, gross: 1000000, discount: 0, cost: 600000, discountedQty: 0 };
  const product = { sellingPrice: 10000, costPrice: 6000 };

  const off = simulate({ baseline, product, levers: { price: 11000, demand: { kind: 'off' } } });
  const none = simulate({ baseline, product, levers: { price: 11000 } });
  ok('demand off identik tanpa demand', JSON.stringify(off.simulated) === JSON.stringify(none.simulated));
  const zero = simulate({ baseline, product, levers: { price: 11000, demand: { kind: 'elasticity', e: 0 } } });
  ok('e=0 identik (qty 100)', zero.qty.simulated === 100 && zero.simulated.profit === 500000, `${zero.qty.simulated}/${zero.simulated.profit}`);

  const same = simulate({ baseline, product, levers: { demand: { kind: 'elasticity', e: 1.5 } } });
  ok('harga tetap: factor 1, qty 100, profit 400rb', same.demand.factor === 1 && same.qty.simulated === 100 && same.simulated.profit === 400000);

  const up = simulate({ baseline, product, levers: { price: 11000, demand: { kind: 'elasticity', e: 1.5 } } });
  ok('harga 11rb: qty ≈86,68, profit 433.392', Math.abs(up.qty.simulated - 86.68) < 0.05 && up.simulated.profit === 433392, `${up.qty.simulated}/${up.simulated.profit}`);

  const far = simulate({ baseline, product, levers: { price: 60000, demand: { kind: 'elasticity', e: 1.5 } } });
  ok('harga 60rb: qty ≈6,80, profit 367.423 < 400rb', Math.abs(far.qty.simulated - 6.8) < 0.05 && far.simulated.profit === 367423, `${far.qty.simulated}/${far.simulated.profit}`);
  ok('harga 60rb: outOfRange + bukan PROFITABLE', far.outOfRange === true && assessScenario(far).code !== 'PROFITABLE');

  const atPeak = simulate({ baseline, product, levers: { price: 13000, demand: { kind: 'elasticity', e: 1.5 } } });
  ok('puncak e=1,5 di batas +30% (harga 13000)', up.peak !== null && up.peak.price === 13000 && up.peak.profit === atPeak.simulated.profit, JSON.stringify(up.peak));
  const lowBound = simulate({ baseline, product: { sellingPrice: 10000, costPrice: 1000 }, levers: { demand: { kind: 'elasticity', e: 1.5 } } });
  ok('puncak dijepit batas −30% (harga 7000)', lowBound.peak !== null && lowBound.peak.price === 7000, JSON.stringify(lowBound.peak));
  const flat1 = simulate({ baseline, product, levers: { price: 11000, demand: { kind: 'elasticity', e: 1.0 } } });
  const flat08 = simulate({ baseline, product, levers: { price: 11000, demand: { kind: 'elasticity', e: 0.8 } } });
  ok('e≤1 tanpa puncak', flat1.peak === null && flat08.peak === null);

  const floor = simulate({ baseline, product, levers: { price: 1, demand: { kind: 'elasticity', e: 1.5 } } });
  ok('plafon 3×: factor 3, qty 300, flag', floor.demand.factor === DEMAND_MAX_FACTOR && floor.qty.simulated === 300 && floor.flags.includes('VOLUME_CAPPED'));

  ok('batas ±30%: 13000 aman', simulate({ baseline, product, levers: { price: 13000 } }).outOfRange === false);
  ok('batas ±30%: 14000 dan 6999 keluar', simulate({ baseline, product, levers: { price: 14000 } }).outOfRange === true && simulate({ baseline, product, levers: { price: 6999 } }).outOfRange === true);
  ok('diskon 50% tanpa ubah harga ikut keluar', simulate({ baseline, product, levers: { discount: { kind: 'percent', pct: 50 } } }).outOfRange === true);

  const disc = simulate({ baseline, product, levers: { discount: { kind: 'percent', pct: 15 }, demand: { kind: 'elasticity', e: 1.5 } } });
  ok('diskon 15%: qty ≈127,61, profit 319.016', Math.abs(disc.qty.simulated - 127.61) < 0.05 && disc.simulated.profit === 319016, `${disc.qty.simulated}/${disc.simulated.profit}`);

  const quota = simulate({ baseline, product, levers: { discount: { kind: 'percent', pct: 15, units: 10 }, demand: { kind: 'elasticity', e: 1.5 } } });
  ok('kuota: factor dari harga list + flag + tanpa puncak', quota.demand.factor === 1 && quota.flags.includes('QUOTA_DEMAND_IGNORED') && quota.peak === null);

  const manual = simulate({ baseline, product, levers: { price: 11000, volume: { kind: 'override', qty: 50 }, demand: { kind: 'elasticity', e: 1.5 } } });
  const manualOld = simulate({ baseline, product, levers: { price: 11000, volume: { kind: 'override', qty: 50 } } });
  ok('override: model mati + identik perilaku lama', manual.demand.applied === false && JSON.stringify(manual.simulated) === JSON.stringify(manualOld.simulated));
  ok('override: band kosong', sensitivityBand({ baseline, product, levers: { price: 11000, volume: { kind: 'override', qty: 50 } } }).length === 0);

  // Monotonik antar level pada 200 baseline acak (harga naik di atas modal).
  // Tanpa diskon histori: pembulatan Rupiah dan ekonomi di bawah modal
  // membalik urutan (rugi reda saat qty susut), jadi di luar cakupan.
  let mono = true;
  for (let it = 0; it < 200; it++) {
    const P = ri(1, 50) * 1000;
    const c = ri(1, P);
    const qty = ri(0, 500);
    const b: Facts = { qty, gross: qty * P, discount: 0, cost: qty * c, discountedQty: 0 };
    const P2 = P + ri(1, 5) * 1000;
    const profits = SENSITIVITY_LEVELS.map((l) => simulate({ baseline: b, product: { sellingPrice: P, costPrice: c }, levers: { price: P2, demand: { kind: 'elasticity', e: l.e } } }).simulated.profit);
    if (!(profits[0] >= profits[1] && profits[1] >= profits[2])) mono = false;
  }
  ok('200 baseline: profit low ≥ medium ≥ high saat harga naik', mono);

  let conv = true;
  for (let d = 0; d <= 40; d++) {
    if (Math.abs(dropFromElasticity(elasticityFromDrop(d)) - d / 100) > 1e-9) conv = false;
  }
  ok('konversi drop↔e bolak-balik (0..40)', conv);
  const drops = SENSITIVITY_LEVELS.map((l) => dropFromElasticity(l.e));
  ok('tiga level ≈ 0,108/0,133/0,212', Math.abs(drops[0] - 0.108) < 0.001 && Math.abs(drops[1] - 0.133) < 0.001 && Math.abs(drops[2] - 0.212) < 0.001, drops.join(','));

  const bandUp = sensitivityBand({ baseline, product, levers: { price: 11000 } });
  const deltasUp = bandUp.map((b) => b.result.impact.vsStatusQuo.profit);
  ok('kasus 11rb: PROFITABLE', assessScenario(up, deltasUp).code === 'PROFITABLE');
  const sens = simulate({ baseline, product, levers: { price: 13000, demand: { kind: 'elasticity', e: 1.5 } } });
  const deltasSens = sensitivityBand({ baseline, product, levers: { price: 13000 } }).map((b) => b.result.impact.vsStatusQuo.profit);
  ok('untung di low, −9% di high: PROFIT_SENSITIVE', assessScenario(sens, deltasSens).code === 'PROFIT_SENSITIVE', deltasSens.join(','));
  const collapse = simulate({ baseline, product, levers: { price: 1000000, demand: { kind: 'elasticity', e: 1.5 } } });
  ok('qty <0,5 + demand aktif: DEMAND_COLLAPSE', collapse.qty.simulated < 0.5 && assessScenario(collapse).code === 'DEMAND_COLLAPSE');

  const robFlip = robustnessOf({ baseline, product, levers: { price: 13000, demand: { kind: 'elasticity', e: 1.5 } } });
  ok('robustness 13rb: beda tanda (tak setuju)', robFlip !== null && !robFlip.agree && (robFlip.pdBase ?? 0) > 0 && (robFlip.pdHigh ?? 0) < 0, JSON.stringify(robFlip));
  const robSame = robustnessOf({ baseline, product, levers: { cost: 5000 } });
  ok('robustness turun modal: setuju', robSame !== null && robSame.agree && (robSame.pdBase ?? 0) > 0 && (robSame.pdHigh ?? 0) > 0, JSON.stringify(robSame));
  ok('robustness qty manual: null', robustnessOf({ baseline, product, levers: { volume: { kind: 'override', qty: 50 } } }) === null);

  const drop13 = simulate({ baseline, product, levers: { price: 13000, demand: { kind: 'elasticity', e: 1.5 } } });
  ok('maxVolumeDrop 13rb ≈ 0,42', drop13.maxVolumeDrop !== null && Math.abs(drop13.maxVolumeDrop - 0.42) < 1e-9, String(drop13.maxVolumeDrop));
  ok('maxVolumeDrop null tanpa histori', simulate({ baseline: { qty: 0, gross: 0, discount: 0, cost: 0, discountedQty: 0 }, product, levers: {} }).maxVolumeDrop === null);

  for (const bad of [-1, 6.5, NaN]) {
    let threw = false;
    try {
      simulate({ baseline, product, levers: { demand: { kind: 'elasticity', e: bad } } });
    } catch (e) {
      threw = e instanceof RangeError;
    }
    if (!threw) ok(`e=${String(bad)} melempar RangeError`, false);
  }
  ok('e di luar batas melempar RangeError', true);
  const clamped = sanitizeLevers({ demand: { kind: 'elasticity', e: 10 } });
  ok('sanitize menjepit e 10→6', JSON.stringify(clamped) === JSON.stringify({ demand: { kind: 'elasticity', e: DEMAND_MAX_ELASTICITY } }));

  // Tak ada NaN/Infinity: e acak 0..6, harga 0..5×, 200 baseline acak.
  let finite = true;
  const nums = (v: unknown): number[] => {
    if (typeof v === 'number') return [v];
    if (Array.isArray(v)) return v.flatMap(nums);
    if (v && typeof v === 'object') return Object.values(v as Record<string, unknown>).flatMap(nums);
    return [];
  };
  for (let it = 0; it < 200; it++) {
    const { baseline: b, P, c } = randomBaseline();
    const r = simulate({
      baseline: b,
      product: { sellingPrice: P, costPrice: c },
      levers: { price: Math.round((P * ri(0, 50)) / 10), demand: { kind: 'elasticity', e: ri(0, 60) / 10 } }
    });
    if (!nums(r).every(Number.isFinite)) finite = false;
  }
  ok('200 acak: SimResult bebas NaN/Infinity', finite);
}

console.log(`\n${passCount} passed, ${failCount} failed\n`);
if (failCount > 0) process.exit(1);

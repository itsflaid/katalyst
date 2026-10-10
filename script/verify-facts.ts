// Verifikasi fondasi engine (src/lib/analytics/facts.ts + series.ts).
// Pola: ok() → PASS/FAIL, exit 1 bila ada FAIL. Acak pakai PRNG ber-seed
// (mulberry32) biar deterministik, 200 iterasi seperti verify-discount.ts.
import {
  addFacts,
  sumFacts,
  factsOfItem,
  metricsOf,
  lineNetOf,
  receiptTotals,
  deltaRatio,
  summarizeFacts,
  totalsOf,
  fillDailySeries,
  calculateRevenue,
  calculateCost,
  calculateProfit,
  getBusinessSummary,
  ZERO_FACTS,
  type Facts,
  type TransactionItemLike
} from '../src/lib/analytics';
import { calculateCart, type DiscountLike } from '../src/lib/discount';
import { makeTime } from '../src/lib/shared/time';

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

// PRNG ber-seed (mulberry32), pola sama seperti seed-demo.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261002);
const ri = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;

function randomItem(pid: string): TransactionItemLike {
  const quantity = ri(1, 20);
  const priceAtSale = ri(1, 50) * 1000;
  const costAtSale = ri(1, priceAtSale);
  const discountAmount = rand() < 0.5 ? 0 : ri(0, quantity * priceAtSale);
  return { productId: pid, quantity, priceAtSale, costAtSale, discountAmount };
}

// F1: aditif, revenue/cost/profit total = jumlah per-partisi (tepat).
console.log('\n== F1: addFacts/sumFacts aditif ==');
{
  let good = true;
  for (let it = 0; it < 200; it++) {
    const items = Array.from({ length: ri(1, 12) }, (_, k) => randomItem(`p${k % 3}`));
    const facts = items.map(factsOfItem);
    // Potong acak jadi 1..4 partisi.
    const parts: Facts[][] = [];
    let rest = [...facts];
    const nParts = ri(1, 4);
    for (let p = 0; p < nParts - 1; p++) {
      const cut = ri(0, rest.length);
      parts.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    parts.push(rest);
    const total = metricsOf(sumFacts(parts.map(sumFacts)));
    const sumRev = parts.reduce((s, pt) => s + metricsOf(sumFacts(pt)).revenue, 0);
    const sumCost = parts.reduce((s, pt) => s + metricsOf(sumFacts(pt)).cost, 0);
    const sumProfit = parts.reduce((s, pt) => s + metricsOf(sumFacts(pt)).profit, 0);
    if (total.revenue !== sumRev || total.cost !== sumCost || total.profit !== sumProfit) good = false;
    // margin dihitung ulang dari total, bukan dijumlahkan.
    if (total.margin !== (total.revenue === 0 ? 0 : total.profit / total.revenue)) good = false;
  }
  ok('200 iterasi partisi acak: revenue/cost/profit tepat, margin dihitung ulang', good);
}

// F2: row-level ≡ agregat.
console.log('\n== F2: core mendelegasikan ke facts ==');
{
  let good = true;
  for (let it = 0; it < 200; it++) {
    const items = Array.from({ length: ri(1, 10) }, (_, k) => randomItem(`p${k % 4}`));
    const m = metricsOf(sumFacts(items.map(factsOfItem)));
    if (calculateRevenue(items) !== m.revenue) good = false;
    if (calculateCost(items) !== m.cost) good = false;
    if (calculateProfit(items) !== m.profit) good = false;
    const b = getBusinessSummary(items);
    if (b.revenue !== m.revenue || b.cost !== m.cost || b.profit !== m.profit || b.margin !== m.margin) good = false;
  }
  ok('200 iterasi: calculateRevenue/Cost/Profit + getBusinessSummary ≡ metricsOf', good);
}

// F3: tanpa discountAmount → revenue = qty × harga.
console.log('\n== F3: kontrak lama tanpa diskon ==');
{
  const item: TransactionItemLike = { productId: 'p1', quantity: 100, priceAtSale: 10000, costAtSale: 6000 };
  ok('revenue 100×10000', calculateRevenue([item]) === 1000000, String(calculateRevenue([item])));
  ok('lineNetOf tanpa discountAmount', lineNetOf({ quantity: 3, priceAtSale: 15000 }) === 45000);
}

// F4: struk, receiptTotals ≡ calculateCart; Σ lineNetOf = cart.total.
console.log('\n== F4: paritas struk dengan kasir ==');
{
  let good = true;
  for (let it = 0; it < 200; it++) {
    const n = ri(1, 5);
    const lines = Array.from({ length: n }, (_, k) => ({
      productId: `p${k}`,
      qty: ri(1, 10),
      price: ri(1, 30) * 1000
    }));
    const pct = ri(5, 50);
    const quota = rand() < 0.5 ? null : ri(1, 12);
    const now = new Date('2026-09-15T10:00:00Z');
    const d: DiscountLike = {
      id: 'd1', name: 'D1', scope: 'PRODUCT', percent: pct, productId: 'p0',
      isActive: true, startsAt: new Date('2026-09-01T00:00:00Z'),
      endsAt: new Date('2026-09-30T00:00:00Z'), quota, quotaUsed: 0, createdAt: now
    };
    const cart = calculateCart(lines, { productDiscounts: [d], global: null, now });
    const rows = cart.lines.map((l) => ({ quantity: l.qty, priceAtSale: l.price, discountAmount: l.discountAmount }));
    const t = receiptTotals(rows);
    if (t.subtotal !== cart.subtotal || t.discountTotal !== cart.discountTotal || t.total !== cart.total) good = false;
    if (rows.reduce((s, r) => s + lineNetOf(r), 0) !== cart.total) good = false;
  }
  ok('200 keranjang acak: receiptTotals ≡ cart; Σ lineNetOf = total', good);
}

// F5: deltaRatio.
console.log('\n== F5: deltaRatio ==');
{
  ok('(10,0)→null', deltaRatio(10, 0) === null);
  ok('(0,0)→0', deltaRatio(0, 0) === 0);
  ok('(150,100)→0.5', deltaRatio(150, 100) === 0.5);
  ok('(0,100)→−1', deltaRatio(0, 100) === -1);
  ok('(−50,−100)→+0.5 (basis negatif membaik)', deltaRatio(-50, -100) === 0.5);
  ok('(−150,−100)→−0.5 (basis negatif memburuk)', deltaRatio(-150, -100) === -0.5);
}

// F6: ZERO_FACTS, semua 0, tanpa NaN.
console.log('\n== F6: ZERO_FACTS ==');
{
  const m = metricsOf(ZERO_FACTS);
  const vals = [m.qty, m.gross, m.discount, m.revenue, m.cost, m.profit, m.margin, m.discountRate, m.avgGrossPrice, m.avgNetPrice, m.avgCost];
  ok('semua 0 dan finite', vals.every((v) => v === 0 && Number.isFinite(v)), JSON.stringify(m));
  ok('addFacts identitas', JSON.stringify(addFacts(ZERO_FACTS, ZERO_FACTS)) === JSON.stringify(ZERO_FACTS));
}

// F7: fillDailySeries, inklusif, hari kosong 0, batas hari 3 zona.
console.log('\n== F7: fillDailySeries ==');
{
  const T = makeTime('Asia/Makassar');
  const from = T.startOfDay(new Date('2026-09-10T00:00:00Z'));
  const to = T.startOfDay(new Date('2026-09-14T00:00:00Z'));
  const rows = fillDailySeries(new Map(), { from, to, T });
  ok('inklusif 5 hari', rows.length === 5, String(rows.length));
  ok('hari kosong = 0 (margin 0)', rows.every((r) => r.revenue === 0 && r.cost === 0 && r.profit === 0 && r.margin === 0 && r.tx === 0));
  // Transaksi di sekitar tengah malam lokal: 16:30Z = WIB 23:30 (29 Sep),
  // WITA/WIT sudah 30 Sep (rujukan verify-time).
  const instant = new Date('2026-09-29T16:30:00Z');
  const expect: Record<string, string> = {
    'Asia/Jakarta': '2026-09-29',
    'Asia/Makassar': '2026-09-30',
    'Asia/Jayapura': '2026-09-30'
  };
  let boundaryOk = true;
  for (const tz of Object.keys(expect) as (keyof typeof expect)[]) {
    const Tz = makeTime(tz);
    const key = Tz.dayKey(instant);
    if (key !== expect[tz]) boundaryOk = false;
    const f: Facts & { txCount: number } = { qty: 2, gross: 20000, discount: 0, cost: 12000, discountedQty: 0, txCount: 1 };
    const series = fillDailySeries(new Map([[key, f]]), {
      from: Tz.startOfDay(Tz.addDays(instant, -1)),
      to: Tz.startOfDay(Tz.addDays(instant, 1)),
      T: Tz
    });
    if (series.length !== 3) boundaryOk = false;
    const hit = series.find((r) => r.key === key);
    if (!hit || hit.revenue !== 20000 || hit.profit !== 8000 || hit.tx !== 1) boundaryOk = false;
    if (series.filter((r) => r.key !== key).some((r) => r.revenue !== 0)) boundaryOk = false;
  }
  ok('batas hari benar untuk 3 zona', boundaryOk);
  // summarizeFacts + totalsOf konsisten dengan agregat per produk.
  const byProduct = new Map<string, Facts>([
    ['a', { qty: 10, gross: 100000, discount: 10000, cost: 60000, discountedQty: 5 }],
    ['b', { qty: 5, gross: 100000, discount: 0, cost: 40000, discountedQty: 0 }]
  ]);
  const sums = summarizeFacts(byProduct, { a: 'A', b: 'B' });
  const tot = totalsOf(sums);
  ok('summarizeFacts: A revenue 90000 profit 30000', sums[0].revenue === 90000 && sums[0].profit === 30000, JSON.stringify(sums[0]));
  ok('totalsOf: revenue 190000 profit 90000', tot.revenue === 190000 && tot.profit === 90000, JSON.stringify(tot));
}

console.log(`\n${passCount} passed, ${failCount} failed\n`);
if (failCount > 0) process.exit(1);

import { decomposeProfit, decomposeProfitMaps } from '../src/lib/analytics/decompose';
import { metricsOf, type Facts } from '../src/lib/analytics/facts';

let failed = 0;
function ok(label: string, pass: boolean) {
  console.log(`  ${pass ? '\x1b[32mPASS' : '\x1b[31mFAIL'}\x1b[0m  ${label}`);
  if (!pass) failed++;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20261004);
const fact = (): Facts => {
  const qty = Math.floor(random() * 100);
  const gross = qty * Math.floor(random() * 50_000);
  const discount = Math.floor(random() * (gross + 1));
  return { qty, gross, discount, cost: qty * Math.floor(random() * 40_000), discountedQty: 0 };
};

let exact = true;
for (let i = 0; i < 10_000; i++) {
  const current = fact(); const previous = fact(); const factors = decomposeProfit(current, previous);
  const delta = metricsOf(current).profit - metricsOf(previous).profit;
  if (Math.abs((factors.volume + factors.price + factors.discount + factors.cost) - delta) > 1e-8) exact = false;
}
ok('10.000 kasus: jumlah faktor = delta profit', exact);
const mapped = decomposeProfitMaps(new Map([['a', { qty: 2, gross: 20, discount: 0, cost: 10, discountedQty: 0 }]]), new Map());
ok('produk baru tetap terurai', Number.isFinite(mapped.volume + mapped.price + mapped.discount + mapped.cost));
if (failed) process.exit(1);

// Penjelasan rumus simulator (murni, tanpa DB); exit 1 bila ada FAIL.
import { fmtInt, fmtPercent, fmtQty, fmtRupiah, fmtDeltaPct, fmtPoin } from '../src/lib/shared/format';
import { simulate, type SimInput, type SimResult } from '../src/lib/analytics/simulation';
import { explainSim, maxDropText, peakEmptyReason, type SimExplain } from '../src/lib/analytics/explain';

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

const baseline = { qty: 100, gross: 7_000_000, discount: 700_000, cost: 5_000_000, discountedQty: 40 };
const product = { sellingPrice: 70_000, costPrice: 50_000 };

function run(levers: NonNullable<SimInput['levers']>): { sim: SimResult; ex: SimExplain } {
  const sim = simulate({ baseline, product, levers });
  return { sim, ex: explainSim(sim, levers) };
}

function clean(label: string, ex: SimExplain) {
  const text = JSON.stringify(ex);
  ok(`${label} tanpa NaN/undefined/Infinity`, !/NaN|undefined|Infinity/.test(text), text.slice(0, 160));
}

function textsMatch(label: string, sim: SimResult, ex: SimExplain, levers: NonNullable<SimInput['levers']>) {
  const s = sim.simulated;
  ok(`${label} revenue`, ex.revenue.main?.result === fmtRupiah(s.revenue), ex.revenue.main?.result);
  ok(`${label} profit`, ex.profit.main?.result === fmtRupiah(s.profit), ex.profit.main?.result);
  ok(`${label} margin`, ex.margin.main?.result === fmtPercent(s.margin), ex.margin.main?.result);
  ok(`${label} qty`, ex.qty.main?.result === fmtQty(sim.qty.simulated) || ex.qty.main === null, ex.qty.main?.result ?? 'main-null');
  ok(`${label} unitProfit`, ex.unitProfit.main?.result === fmtRupiah(sim.unit.unitProfit), ex.unitProfit.main?.result);
  if (ex.revenue.versus) ok(`${label} versus revenue`, ex.revenue.versus.result === fmtDeltaPct(sim.impact.vsStatusQuo.revenue));
  if (ex.profit.versus) ok(`${label} versus profit`, ex.profit.versus.result === fmtDeltaPct(sim.impact.vsStatusQuo.profit));
  if (ex.qty.versus) ok(`${label} versus qty`, ex.qty.versus.result === fmtDeltaPct(sim.impact.vsStatusQuo.qty));
  if (ex.margin.versus) ok(`${label} versus margin`, ex.margin.versus.result === fmtPoin(sim.impact.vsStatusQuo.marginPoints));
  const be = sim.breakEvenQty;
  const beText = be === null ? 'Tidak impas' : be === 0 ? '-' : `${fmtInt(be)} unit`;
  ok(`${label} breakEven`, ex.breakEven.main?.result === beText, ex.breakEven.main?.result);
  if (sim.peak === null) {
    ok(`${label} peak null`, ex.peak.main === null && ex.peak.notes.join(' ').includes(peakEmptyReason(sim, levers)), ex.peak.notes.join(' | '));
  } else {
    ok(`${label} peak main`, ex.peak.main !== null);
  }
}

console.log('\n== explain: golden tanpa tuas ==');
{
  const { sim, ex } = run({});
  clean('golden', ex);
  ok('revenue expr', ex.revenue.main?.expr === 'Rp7.000.000 − Rp700.000', ex.revenue.main?.expr);
  ok('revenue result', ex.revenue.main?.result === 'Rp6.300.000', ex.revenue.main?.result);
  ok('profit result', ex.profit.main?.result === 'Rp1.300.000', ex.profit.main?.result);
  ok('margin result', ex.margin.main?.result === '20,6%', ex.margin.main?.result);
  ok('unitProfit result', ex.unitProfit.main?.result === 'Rp13.000', ex.unitProfit.main?.result);
  ok('breakEven result', ex.breakEven.main?.result === '100 unit', ex.breakEven.main?.result);
  ok('maxDrop result', ex.maxDrop.main?.result === '0,0% dari 100 unit', ex.maxDrop.main?.result);
  ok('maxDiscount result', ex.maxDiscount.main?.result === '28%', ex.maxDiscount.main?.result);
  ok('maxDropText sama', maxDropText(sim) === '0,0% dari 100 unit');
  textsMatch('golden', sim, ex, {});
}

const scenarios: { label: string; levers: NonNullable<SimInput['levers']>; baselineQty0?: boolean }[] = [
  { label: 'tanpa tuas', levers: {} },
  { label: 'harga+10% diskon 10', levers: { price: 77000, discount: { kind: 'percent', pct: 10 } } },
  { label: 'diskon berkuota', levers: { discount: { kind: 'percent', pct: 10, units: 30 } } },
  { label: 'qty manual', levers: { volume: { kind: 'override', qty: 80 } } },
  { label: 'permintaan aktif', levers: { price: 77000, demand: { kind: 'on' } } },
  { label: 'faktor dibatasi', levers: { price: 10000, demand: { kind: 'on' } } },
  { label: 'tanpa histori', levers: {} },
  { label: 'di bawah modal', levers: { cost: 65000 } },
  { label: 'revenue 0', levers: { price: 0 } }
];

console.log('\n== explain: skenario ==');
for (const sc of scenarios) {
  const base = sc.label === 'tanpa histori' ? { qty: 0, gross: 0, discount: 0, cost: 0, discountedQty: 0 } : baseline;
  const prod = sc.label === 'di bawah modal' ? { sellingPrice: 70_000, costPrice: 60_000 } : product;
  const sim = simulate({ baseline: base, product: prod, levers: sc.levers });
  const ex = explainSim(sim, sc.levers);
  clean(sc.label, ex);
  textsMatch(sc.label, sim, ex, sc.levers);
  if (sc.label === 'permintaan aktif') {
    const all = [ex.revenue, ex.profit, ex.margin, ex.qty, ex.unitProfit];
    const hasApprox = all.some((e) => e.main?.approx) || all.some((e) => e.parts.some((p) => p.approx)) || all.some((e) => e.versus?.approx);
    ok('permintaan aktif ada approx', hasApprox);
    ok(
      'permintaan aktif notes pembulatan',
      ex.qty.notes.some((n) => n.includes('dibulatkan'))
    );
  }
  if (sc.label === 'tanpa histori') {
    ok(
      'tanpa histori semua versus null',
      ex.revenue.versus === null && ex.profit.versus === null && ex.margin.versus === null && ex.qty.versus === null
    );
  }
}

console.log(`\n${passCount} passed, ${failCount} failed`);
if (failCount > 0) process.exit(1);

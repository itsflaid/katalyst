import { toModelView } from '../src/lib/server/domains/copilot/model-view';
import { buildSimulatePriceData, simFlagText } from '../src/lib/server/domains/copilot/tools/simulate-price';
import type { SimFlag } from '../src/lib/simulation';

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

const product = { id: 'p1', name: 'Amplang', sellingPrice: 10000, costPrice: 6000 };
const baseline = { qty: 100, gross: 1000000, discount: 50000, cost: 600000, discountedQty: 10 };

const multi = buildSimulatePriceData({
  product,
  baseline,
  period: 'last_30d',
  windowLabel: '30 hari terakhir',
  targetPrice: 12000,
  priceDelta: 2000,
  volumePcts: [-20, -10, 0, 10, 20]
});
ok('lima skenario volume', multi.volumeScenarios.map((s) => s.volumePct).join(',') === '-20,-10,0,10,20');
ok('skenario memakai harga baru', multi.scenario.priceText === 'Rp12.000' && multi.scenario.priceChangeText === '+Rp2.000');
ok('tanpa diskon teks null', multi.scenario.discountPctText === null);

const single = buildSimulatePriceData({
  product,
  baseline,
  period: 'last_30d',
  windowLabel: '30 hari terakhir',
  targetPrice: 12000,
  priceDelta: 2000,
  discountPct: 10,
  volumePcts: [10]
});
ok('satu skenario bila volume diisi', single.volumeScenarios.length === 1 && single.volumeScenarios[0].volumePct === 10);
ok('teks diskon terisi', single.scenario.discountPctText === '10,0%');

const flat = buildSimulatePriceData({
  product,
  baseline,
  period: 'last_30d',
  windowLabel: '30 hari terakhir',
  targetPrice: 10000,
  volumePcts: [0]
});
ok('volume 0 tanpa tuas impas', flat.volumeScenarios[0].profitVsNowText === '0,0%');

const codes: SimFlag[] = ['NO_HISTORY', 'BELOW_COST', 'LOW_MARGIN', 'DISCOUNT_ON_CHANGED_PRICE', 'PROMO_SCALED_WITH_VOLUME', 'DRIFT_PRICE', 'DRIFT_COST'];
const texts = codes.map(simFlagText);
ok('tujuh flag punya teks', texts.every((t) => typeof t === 'string' && t.length > 0) && new Set(texts).size === codes.length);

const empty = buildSimulatePriceData({
  product,
  baseline: { qty: 0, gross: 0, discount: 0, cost: 0, discountedQty: 0 },
  period: 'last_30d',
  windowLabel: '30 hari terakhir',
  targetPrice: 10000,
  volumePcts: [0]
});
const noHistory = empty.flags.find((f) => f.code === 'NO_HISTORY');
ok('tanpa riwayat ditandai', noHistory !== undefined && noHistory.text.length > 0);
ok('impas tanpa riwayat null', empty.breakEven.volumePct === null && empty.breakEven.text === null);

const cheap = buildSimulatePriceData({
  product,
  baseline,
  period: 'last_30d',
  windowLabel: '30 hari terakhir',
  targetPrice: 5000,
  volumePcts: [0]
});
ok('di bawah modal ditandai', cheap.flags.some((f) => f.code === 'BELOW_COST' && f.text.length > 0));

ok('tanpa NaN atau Infinity', finiteDeep(JSON.parse(JSON.stringify(multi))) && finiteDeep(JSON.parse(JSON.stringify(single))));

const view = JSON.stringify(toModelView(multi));
ok(
  'proyeksi model hanya memuat teks angka',
  !view.includes('"volumePct"') && !view.includes('540000') && !view.includes('350000') && view.includes('Rp540.000') && view.includes('volumePctText')
);

const sens = buildSimulatePriceData({
  product,
  baseline,
  period: 'last_30d',
  windowLabel: '30 hari terakhir',
  targetPrice: 12000,
  priceDelta: 2000,
  volumePcts: [0],
  sensitivity: 'medium'
});
ok('model aktif: qty 0% dari model (≈76,07, bukan 100)', Math.abs(sens.volumeScenarios[0].qty - 76.07) < 0.05 && sens.volumeScenarios[0].profit === 410792, `${sens.volumeScenarios[0].qty}/${sens.volumeScenarios[0].profit}`);
ok('band 3 entri + drop terisi', sens.band.length === 3 && typeof sens.demand?.dropPer10PctText === 'string' && (sens.demand?.dropPer10PctText.length ?? 0) > 0);
ok('puncak di batas +30% (harga 13000)', sens.peak !== null && sens.peak.price === 13000 && sens.peak.priceText === 'Rp13.000', JSON.stringify(sens.peak));

const far = buildSimulatePriceData({
  product,
  baseline,
  period: 'last_30d',
  windowLabel: '30 hari terakhir',
  targetPrice: 60000,
  volumePcts: [0],
  sensitivity: 'medium'
});
const oor = far.flags.find((f) => f.code === 'OUT_OF_RANGE_PRICE');
ok('harga 60rb: flag luar jangkauan berteks', oor !== undefined && oor.text.length > 0);
ok('harga 60rb: bukan PROFITABLE', far.assessment.code !== 'PROFITABLE', far.assessment.code);

ok('baru bebas NaN/Infinity', finiteDeep(JSON.parse(JSON.stringify(sens))) && finiteDeep(JSON.parse(JSON.stringify(far))));

const sensView = JSON.stringify(toModelView(sens));
ok(
  'proyeksi baru tanpa angka mentah',
  !sensView.includes('18000') && !sensView.includes('"e":') && sensView.includes('Rp') && sensView.includes('dropPer10PctText')
);

if (failed) process.exit(1);

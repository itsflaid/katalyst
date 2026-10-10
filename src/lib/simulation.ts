// Simulator "what-if" satu produk. Murni + isomorfik (server & browser):
// tanpa drizzle-orm/$env/$app, tanpa jam sistem. Diskon hipotetis memakai
// unitDiscount (bulat per unit, sama seperti kasir) dan boleh dibatasi kuota unit.
import {
  deltaRatio,
  factsOfItem,
  metricsOf,
  sumFacts,
  type Facts,
  type Metrics
} from './analytics/facts';
import type { TransactionItemLike } from './analytics/core';
import { isBelowCost, unitDiscount } from './discount';

export type DiscountLever =
  | { kind: 'keep' }
  | { kind: 'percent'; pct: number; units?: number };

export type VolumeLever =
  | { kind: 'pct'; pct: number }
  | { kind: 'override'; qty: number };

// Respons permintaan terhadap harga efektif; mati berarti qty ikut rumus lama.
export type DemandLever = { kind: 'off' } | { kind: 'elasticity'; e: number };

export const DEMAND_MAX_FACTOR = 3;
export const DEMAND_MAX_ELASTICITY = 6;
export const PRICE_RANGE_LIMIT_PCT = 30;

export const SENSITIVITY_LEVELS = [
  { id: 'low', label: 'Pembeli setia', e: 1.2 },
  { id: 'medium', label: 'Pembeli biasa', e: 1.5 },
  { id: 'high', label: 'Pembeli gampang pindah', e: 2.5 }
] as const;

export type SensitivityId = (typeof SENSITIVITY_LEVELS)[number]['id'];

// turun10 = 1 − 1,1^(−e)   (fraksi penjualan hilang tiap harga naik 10%)
export function dropFromElasticity(e: number): number {
  return 1 - Math.pow(1.1, -e);
}

// e = −ln(1 − d) / ln(1,1)   (d dijepit 0..40; 0 bila tidak finit)
export function elasticityFromDrop(dropPct: number): number {
  if (!Number.isFinite(dropPct)) return 0;
  const d = Math.min(40, Math.max(0, dropPct)) / 100;
  return -Math.log(1 - d) / Math.log(1.1);
}

export interface SimInput {
  baseline: Facts;
  product: { sellingPrice: number; costPrice: number };
  levers?: {
    price?: number;
    cost?: number;
    discount?: DiscountLever;
    volume?: VolumeLever;
    demand?: DemandLever;
  };
}

export interface Impact {
  revenue: number | null;
  profit: number | null;
  qty: number | null;
  marginPoints: number;
}

export type SimFlag =
  | 'NO_HISTORY'
  | 'BELOW_COST'
  | 'LOW_MARGIN'
  | 'DISCOUNT_ON_CHANGED_PRICE'
  | 'PROMO_SCALED_WITH_VOLUME'
  | 'DRIFT_PRICE'
  | 'DRIFT_COST'
  | 'OUT_OF_RANGE_PRICE'
  | 'VOLUME_CAPPED'
  | 'QUOTA_DEMAND_IGNORED';

export interface DemandInfo {
  applied: boolean;
  e: number;
  ratio: number;
  factor: number;
  capped: boolean;
}

export interface SimResult {
  actual: Metrics;
  statusQuo: Metrics;
  simulated: Metrics;
  qty: { baseline: number; simulated: number };
  unit: { listPrice: number; cost: number; unitProfit: number };
  impact: { vsStatusQuo: Impact; vsActual: Impact };
  drift: { price: number; cost: number };
  breakEvenQty: number | null;
  maxDiscountPct: number | null;
  demand: DemandInfo;
  peak: { price: number; profit: number } | null;
  maxVolumeDrop: number | null;
  outOfRange: boolean;
  flags: SimFlag[];
}

function reqInt(name: string, v: number, min: number, max?: number): number {
  if (!Number.isInteger(v) || v < min || (max !== undefined && v > max)) {
    throw new RangeError(`${name} harus integer ${min}..${max ?? '∞'} (dapat: ${v})`);
  }
  return v;
}

// gross         = qty × price
// discount      = min(qty, units ?? qty) × unitDiscount(price, pct)   (tuas percent)
// discountedQty = min(qty, units ?? qty)   (tuas percent)
// discount      = round(gross × discountRate)   (tuas keep; discountRate dari baseline)
// discountedQty = round(baseDiscountedQty × qty / baseQty)   (tuas keep; 0 bila baseQty = 0)
// cost          = qty × cost
function projectQty(
  qty: number,
  price: number,
  cost: number,
  discountRate: number,
  discountLever: DiscountLever | undefined,
  baseDiscountedQty: number,
  baseQty: number
): Facts {
  const gross = qty * price;
  let discount: number;
  let discountedQty: number;
  if (discountLever?.kind === 'percent') {
    const covered = Math.min(qty, discountLever.units ?? qty);
    discount = covered * unitDiscount(price, discountLever.pct);
    discountedQty = covered;
  } else {
    discount = Math.round(gross * discountRate);
    discountedQty = baseQty === 0 ? 0 : Math.round((baseDiscountedQty * qty) / baseQty);
  }
  return { qty, gross, discount, cost: qty * cost, discountedQty };
}

// impact.revenue, .profit, .qty = deltaRatio(sim, base)   (null bila base = 0 dan sim ≠ 0)
// impact.marginPoints           = sim.margin − base.margin
function impactOf(sim: Metrics, base: Metrics): Impact {
  return {
    revenue: deltaRatio(sim.revenue, base.revenue),
    profit: deltaRatio(sim.profit, base.profit),
    qty: deltaRatio(sim.qty, base.qty),
    marginPoints: sim.margin - base.margin
  };
}

export function simulate(input: SimInput): SimResult {
  const baseline: Facts = { ...input.baseline };
  const P = reqInt('sellingPrice', input.product.sellingPrice, 0);
  const c = reqInt('costPrice', input.product.costPrice, 0);
  const levers = input.levers ?? {};
  const P2 = levers.price === undefined ? P : reqInt('price', levers.price, 0);
  const c2 = levers.cost === undefined ? c : reqInt('cost', levers.cost, 0);
  const discountLever = levers.discount;
  if (discountLever?.kind === 'percent') {
    reqInt('pct', discountLever.pct, 0, 100);
    if (discountLever.units !== undefined) reqInt('units', discountLever.units, 0);
  }
  const demandLever = levers.demand;
  if (demandLever?.kind === 'elasticity') {
    const e = demandLever.e;
    if (!Number.isFinite(e) || e < 0 || e > DEMAND_MAX_ELASTICITY) {
      throw new RangeError(`demand e harus 0..${DEMAND_MAX_ELASTICITY} (dapat: ${e})`);
    }
  }

  const B = metricsOf(baseline);
  // Peff0 = P × (1 − dr0)
  // Peff2 = P2 − unitDiscount(P2, pct)   (tuas percent tanpa kuota)
  // Peff2 = P2                            (tuas percent berkuota; respons diskon tak dihitung)
  // Peff2 = P2 × (1 − dr0)                (tuas keep)
  const dr0 = B.discountRate;
  const Peff0 = P * (1 - dr0);
  const quotaDemand = discountLever?.kind === 'percent' && discountLever.units !== undefined;
  const Peff2 = discountLever?.kind === 'percent'
    ? quotaDemand
      ? P2
      : P2 - unitDiscount(P2, discountLever.pct)
    : P2 * (1 - dr0);

  // Model dipakai hanya bila pembeli peka harga, qty bukan manual, ada histori, dan harga acuan positif.
  const useDemand =
    demandLever?.kind === 'elasticity' &&
    levers.volume?.kind !== 'override' &&
    baseline.qty > 0 &&
    Peff0 > 0;

  let simQty: number;
  let volumeChanged = false;
  let demand: DemandInfo = { applied: false, e: 0, ratio: 1, factor: 1, capped: false };
  const vol = levers.volume;
  if (vol?.kind === 'override') {
    simQty = reqInt('qty', vol.qty, 0);
    volumeChanged = simQty !== baseline.qty;
  } else {
    const pct = vol?.pct ?? 0;
    if (!Number.isInteger(pct)) throw new RangeError(`volume pct harus integer (dapat: ${pct})`);
    if (useDemand && demandLever?.kind === 'elasticity') {
      // factorRaw = ratio^(−e)   (Infinity bila ratio ≤ 0)
      // factor    = min(factorRaw, 3)
      const e = demandLever.e;
      const ratio = Peff2 / Peff0;
      const factorRaw = ratio <= 0 ? Infinity : Math.pow(ratio, -e);
      const factor = e === 0 ? 1 : Math.min(factorRaw, DEMAND_MAX_FACTOR);
      const capped = e !== 0 && factorRaw > DEMAND_MAX_FACTOR;
      demand = { applied: true, e, ratio, factor, capped };
      simQty = Math.max(0, baseline.qty * factor * (1 + pct / 100));
    } else {
      simQty = Math.max(0, Math.round(baseline.qty * (1 + pct / 100)));
    }
    volumeChanged = pct !== 0 || (demand.applied && demand.factor !== 1);
  }

  const actual = B;
  // Uang dibulatkan per komponen hanya di jalur model; profit/margin
  // turunannya tetap konsisten (revenue = gross − discount).
  const roundMoney = (f: Facts): Facts =>
    demand.applied
      ? { qty: f.qty, gross: Math.round(f.gross), discount: Math.round(f.discount), cost: Math.round(f.cost), discountedQty: f.discountedQty }
      : f;
  const statusQuo = metricsOf(projectQty(baseline.qty, P, c, B.discountRate, undefined, baseline.discountedQty, baseline.qty));
  const simulated = metricsOf(roundMoney(projectQty(simQty, P2, c2, B.discountRate, discountLever, baseline.discountedQty, baseline.qty)));

  const unitProfit = simulated.avgNetPrice - c2;
  // drift.price = P − avgGrossPrice   (0 bila qty baseline = 0)
  // drift.cost  = c − avgCost
  const drift = {
    price: baseline.qty === 0 ? 0 : P - B.avgGrossPrice,
    cost: baseline.qty === 0 ? 0 : c - B.avgCost
  };

  const flags: SimFlag[] = [];
  if (baseline.qty === 0) flags.push('NO_HISTORY');
  if (simQty > 0 && unitProfit < 0) flags.push('BELOW_COST');
  if (simQty > 0 && simulated.margin < 0.15) flags.push('LOW_MARGIN');
  if (discountLever?.kind === 'percent' && P2 !== P) flags.push('DISCOUNT_ON_CHANGED_PRICE');
  if ((discountLever === undefined || discountLever.kind === 'keep') && volumeChanged) {
    flags.push('PROMO_SCALED_WITH_VOLUME');
  }
  if (Math.abs(drift.price) >= 1) flags.push('DRIFT_PRICE');
  if (Math.abs(drift.cost) >= 1) flags.push('DRIFT_COST');
  // Harga di luar ±30% dari harga sekarang; aritmetika integer biar batasnya tepat.
  // Harga efektif ikut dicek setelah dibulatkan: diskon besar
  // menggeser jangkauan walau harga etiket tetap.
  const listOut = P > 0 ? Math.abs(P2 - P) * 100 > P * PRICE_RANGE_LIMIT_PCT : P2 > 0;
  const peffOut =
    Peff0 > 0 &&
    (Math.round(Peff2) * 100 > Math.round(Peff0) * 130 || Math.round(Peff2) * 100 < Math.round(Peff0) * 70);
  const outOfRange = listOut || peffOut;
  if (outOfRange) flags.push('OUT_OF_RANGE_PRICE');
  if (demand.capped) flags.push('VOLUME_CAPPED');
  if (quotaDemand) flags.push('QUOTA_DEMAND_IGNORED');

  let breakEvenQty: number | null;
  if (statusQuo.profit <= 0) {
    breakEvenQty = 0;
  } else if (unitProfit <= 0) {
    breakEvenQty = null;
  } else {
    const profitAt = (q: number) =>
      metricsOf(projectQty(q, P2, c2, B.discountRate, discountLever, baseline.discountedQty, baseline.qty)).profit;
    const target = statusQuo.profit;
    const upper = Math.max(simQty * 100, 1000000);
    if (profitAt(upper) < target) {
      breakEvenQty = null;
    } else {
      let lo = 0;
      let hi = upper;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (profitAt(mid) >= target) hi = mid;
        else lo = mid + 1;
      }
      while (lo > 0 && profitAt(lo - 1) >= target) lo--;
      while (profitAt(lo) < target) lo++;
      breakEvenQty = lo;
    }
  }

  let maxDiscountPct: number | null;
  if (P2 <= 0) {
    maxDiscountPct = null;
  } else {
    maxDiscountPct = 0;
    for (let p = 100; p >= 0; p--) {
      if (!isBelowCost(P2, c2, p)) {
        maxDiscountPct = p;
        break;
      }
    }
  }

  // maxVolumeDrop = 1 − breakEvenQty / baseline.qty   (negatif berarti harus naik)
  const maxVolumeDrop =
    breakEvenQty === null || baseline.qty === 0 ? null : 1 - breakEvenQty / baseline.qty;

  // Harga optimal = laba model yang sama pada harga list bulat.
  // PeffAnalytic = c2 × e / (e − 1)
  // PeffBoundary = Peff0 × 3^(−1/e); ±30% harga efektif sekarang = terbaik dalam rentang data.
  let peak: { price: number; profit: number } | null = null;
  if (demand.applied && demand.e > 1 && baseline.qty > 0 && !quotaDemand && c2 >= 0) {
    const d = discountLever?.kind === 'percent' ? discountLever.pct / 100 : dr0;
    if (1 - d > 0) {
      const peffStar = Math.min(Math.max((c2 * demand.e) / (demand.e - 1), Peff0 * Math.pow(DEMAND_MAX_FACTOR, -1 / demand.e), Peff0 * 0.7), Peff0 * 1.3);
      const price = Math.round(peffStar / (1 - d));
      if (Number.isFinite(price) && price >= 0) {
        const ratioAt = Peff0 > 0 ? (discountLever?.kind === 'percent' ? price - unitDiscount(price, discountLever.pct) : price * (1 - dr0)) / Peff0 : 1;
        const factorAt = Math.min(ratioAt <= 0 ? Infinity : Math.pow(ratioAt, -demand.e), DEMAND_MAX_FACTOR);
        const qtyAt = Math.max(0, baseline.qty * factorAt * (1 + (vol?.kind === 'pct' ? vol.pct : 0) / 100));
        const profit = metricsOf(roundMoney(projectQty(qtyAt, price, c2, dr0, discountLever, baseline.discountedQty, baseline.qty))).profit;
        if (Number.isFinite(profit) && profit > 0) peak = { price, profit };
      }
    }
  }

  return {
    actual,
    statusQuo,
    simulated,
    qty: { baseline: baseline.qty, simulated: simQty },
    unit: { listPrice: P2, cost: c2, unitProfit },
    impact: { vsStatusQuo: impactOf(simulated, statusQuo), vsActual: impactOf(simulated, actual) },
    drift,
    breakEvenQty,
    maxDiscountPct,
    demand,
    peak,
    maxVolumeDrop,
    outOfRange,
    flags
  };
}

export type ScenarioCode =
  | 'NO_VOLUME'
  | 'DEMAND_COLLAPSE'
  | 'UNIT_LOSS'
  | 'LOSS'
  | 'OUT_OF_RANGE'
  | 'PROFIT_SENSITIVE'
  | 'PROFITABLE'
  | 'NEUTRAL';

export function assessScenario(
  result: SimResult,
  bandDeltas: (number | null)[] = []
): { tone: 'positive' | 'warning' | 'negative' | 'neutral'; code: ScenarioCode } {
  const pd = result.impact.vsStatusQuo.profit ?? 0;
  const mp = result.impact.vsStatusQuo.marginPoints;
  if (result.qty.simulated < 0.5) {
    return result.demand.applied && result.qty.baseline > 0
      ? { tone: 'negative', code: 'DEMAND_COLLAPSE' }
      : { tone: 'neutral', code: 'NO_VOLUME' };
  }
  if (result.unit.unitProfit < 0) return { tone: 'negative', code: 'UNIT_LOSS' };
  if (pd <= -0.05 || result.simulated.margin < 0) return { tone: 'negative', code: 'LOSS' };
  if (pd >= 0.05 && mp >= -0.02) {
    if (result.outOfRange) return { tone: 'warning', code: 'OUT_OF_RANGE' };
    if (bandDeltas.some((d) => d !== null && d <= -0.05)) return { tone: 'warning', code: 'PROFIT_SENSITIVE' };
    return { tone: 'positive', code: 'PROFITABLE' };
  }
  return { tone: 'warning', code: 'NEUTRAL' };
}

// Tiap tingkat sensitivitas dijalankan model yang sama; kosong bila qty manual.
export function sensitivityBand(input: SimInput): { id: string; label: string; e: number; result: SimResult }[] {
  if (input.levers?.volume?.kind === 'override') return [];
  return SENSITIVITY_LEVELS.map((l) => ({
    id: l.id,
    label: l.label,
    e: l.e,
    result: simulate({ ...input, levers: { ...input.levers, demand: { kind: 'elasticity', e: l.e } } })
  }));
}

export interface Robustness {
  eBase: number;
  eHigh: number;
  pdBase: number | null;
  pdHigh: number | null;
  agree: boolean;
}

// Tanda untung dibandingkan di dua sensitivitas; null bila qty manual.
export function robustnessOf(input: SimInput, eHigh = 3): Robustness | null {
  if (input.levers?.volume?.kind === 'override') return null;
  const eBase = input.levers?.demand?.kind === 'elasticity' ? input.levers.demand.e : 1.5;
  const run = (e: number) =>
    simulate({ ...input, levers: { ...input.levers, demand: { kind: 'elasticity' as const, e } } }).impact.vsStatusQuo.profit;
  if (eBase === eHigh) {
    const pd = run(eBase);
    return { eBase, eHigh, pdBase: pd, pdHigh: pd, agree: true };
  }
  const pdBase = run(eBase);
  const pdHigh = run(eHigh);
  const sign = (v: number | null) => (v === null || v === 0 ? 0 : v > 0 ? 1 : -1);
  return { eBase, eHigh, pdBase, pdHigh, agree: sign(pdBase) === sign(pdHigh) };
}

export function sanitizeLevers(levers: NonNullable<SimInput['levers']>): NonNullable<SimInput['levers']> {
  const nonNeg = (v: number): number => {
    const r = Math.round(v);
    return Number.isFinite(r) ? Math.max(0, r) : 0;
  };
  const pct100 = (v: number): number => {
    const r = Math.round(v);
    return Number.isFinite(r) ? Math.min(100, Math.max(0, r)) : 0;
  };
  const roundInt = (v: number): number => {
    const r = Math.round(v);
    return Number.isFinite(r) ? r : 0;
  };
  const out: NonNullable<SimInput['levers']> = {};
  if (levers.price !== undefined) out.price = nonNeg(levers.price);
  if (levers.cost !== undefined) out.cost = nonNeg(levers.cost);
  if (levers.discount !== undefined) {
    out.discount =
      levers.discount.kind === 'keep'
        ? { kind: 'keep' }
        : {
            kind: 'percent',
            pct: pct100(levers.discount.pct),
            ...(levers.discount.units !== undefined ? { units: nonNeg(levers.discount.units) } : {})
          };
  }
  if (levers.volume !== undefined) {
    out.volume =
      levers.volume.kind === 'override'
        ? { kind: 'override', qty: nonNeg(levers.volume.qty) }
        : { kind: 'pct', pct: roundInt(levers.volume.pct) };
  }
  if (levers.demand !== undefined) {
    out.demand =
      levers.demand.kind === 'off'
        ? { kind: 'off' }
        : { kind: 'elasticity', e: Number.isFinite(levers.demand.e) ? Math.min(DEMAND_MAX_ELASTICITY, Math.max(0, levers.demand.e)) : 0 };
  }
  return out;
}



export interface ProductLike {
  id: string;
  name: string;
  costPrice: number;
  sellingPrice: number;
}

export interface ScenarioInput {
  newSellingPrice?: number;
  discountPercent?: number;
  newCostPrice?: number;
  quantityOverride?: number;
}

export interface ScenarioMetrics {
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
}

export interface ScenarioResult {
  current: ScenarioMetrics;
  simulated: ScenarioMetrics;
  impact: {
    revenueChangePercent: number;
    profitChangePercent: number;
  };
  baselineQuantity: number;
  assumptions: string[];
}


export function simulateScenario(
  product: ProductLike,
  historicalItems: TransactionItemLike[],
  scenario: ScenarioInput
): ScenarioResult {
  const productItems = historicalItems.filter((i) => i.productId === product.id);
  const baseline = sumFacts(productItems.map(factsOfItem));

  const levers: NonNullable<SimInput['levers']> = {};
  if (scenario.newSellingPrice !== undefined) levers.price = scenario.newSellingPrice;
  if (scenario.newCostPrice !== undefined) levers.cost = scenario.newCostPrice;
  if (scenario.discountPercent) levers.discount = { kind: 'percent', pct: scenario.discountPercent * 100 };
  if (scenario.quantityOverride !== undefined) levers.volume = { kind: 'override', qty: scenario.quantityOverride };

  const r = simulate({
    baseline,
    product: { sellingPrice: product.sellingPrice, costPrice: product.costPrice },
    levers
  });

  const baselineQuantity = r.qty.simulated;
  const assumptions: string[] = [
    scenario.quantityOverride
      ? `Quantity memakai angka manual: ${baselineQuantity} unit.`
      : `Quantity diasumsikan tetap mengikuti total historis: ${baselineQuantity} unit.`
  ];
  if (productItems.length === 0) {
    assumptions.push(
      'Tidak ada data transaksi historis untuk produk ini, hasil simulasi kurang bisa diandalkan. Sebaiknya isi quantityOverride manual.'
    );
  }
  if (scenario.discountPercent && scenario.newSellingPrice) {
    assumptions.push('Diskon diterapkan di atas newSellingPrice yang diinput, bukan di atas harga jual saat ini.');
  }

  return {
    current: { revenue: r.actual.revenue, cost: r.actual.cost, profit: r.actual.profit, margin: r.actual.margin },
    simulated: {
      revenue: r.simulated.revenue,
      cost: r.simulated.cost,
      profit: r.simulated.profit,
      margin: r.simulated.margin
    },
    impact: {
      revenueChangePercent: r.impact.vsActual.revenue ?? 0,
      profitChangePercent: r.impact.vsActual.profit ?? 0
    },
    baselineQuantity,
    assumptions
  };
}

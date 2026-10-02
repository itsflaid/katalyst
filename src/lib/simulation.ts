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

export interface SimInput {
  baseline: Facts;
  product: { sellingPrice: number; costPrice: number };
  levers?: {
    price?: number;
    cost?: number;
    discount?: DiscountLever;
    volume?: VolumeLever;
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
  | 'DRIFT_COST';

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
  flags: SimFlag[];
}

function reqInt(name: string, v: number, min: number, max?: number): number {
  if (!Number.isInteger(v) || v < min || (max !== undefined && v > max)) {
    throw new RangeError(`${name} harus integer ${min}..${max ?? '∞'} (dapat: ${v})`);
  }
  return v;
}

// simQty      = qty × (P − unitDisc) − qty × c
// revenue     = gross − discount
// discountRate = discount / gross   (dari baseline)
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

// revenue = (simRevenue − baseRevenue) / |baseRevenue|   (null bila base = 0)
// profit  = (simProfit − baseProfit) / |baseProfit|
// qty     = (simQty − baseQty) / |baseQty|
// marginPoints = simMargin − baseMargin
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

  let simQty: number;
  let volumeChanged = false;
  const vol = levers.volume;
  if (vol?.kind === 'override') {
    simQty = reqInt('qty', vol.qty, 0);
    volumeChanged = simQty !== baseline.qty;
  } else {
    const pct = vol?.pct ?? 0;
    if (!Number.isInteger(pct)) throw new RangeError(`volume pct harus integer (dapat: ${pct})`);
    simQty = Math.max(0, Math.round(baseline.qty * (1 + pct / 100)));
    volumeChanged = pct !== 0;
  }

  const B = metricsOf(baseline);
  const actual = B;
  const statusQuo = metricsOf(projectQty(baseline.qty, P, c, B.discountRate, undefined, baseline.discountedQty, baseline.qty));
  const simulated = metricsOf(projectQty(simQty, P2, c2, B.discountRate, discountLever, baseline.discountedQty, baseline.qty));

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
    flags
  };
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
      'Tidak ada data transaksi historis untuk produk ini — hasil simulasi kurang bisa diandalkan. Sebaiknya isi quantityOverride manual.'
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

// Kamus tunggal angka, isomorfik server/browser: tanpa drizzle-orm/$env/$app
// dan tanpa jam sistem. Uang = integer Rupiah; rasio = pecahan (0.25 = 25%).
import type { TransactionItemLike } from './core';

export interface Facts {
  qty: number;
  gross: number;
  discount: number;
  cost: number;
  discountedQty: number;
}

export const ZERO_FACTS: Facts = { qty: 0, gross: 0, discount: 0, cost: 0, discountedQty: 0 };

export function addFacts(a: Facts, b: Facts): Facts {
  return {
    qty: a.qty + b.qty,
    gross: a.gross + b.gross,
    discount: a.discount + b.discount,
    cost: a.cost + b.cost,
    discountedQty: a.discountedQty + b.discountedQty
  };
}

export function sumFacts(list: Facts[]): Facts {
  return list.reduce(addFacts, { ...ZERO_FACTS });
}

export function factsOfItem(i: TransactionItemLike): Facts {
  return {
    qty: i.quantity,
    gross: i.quantity * i.priceAtSale,
    discount: i.discountAmount ?? 0,
    cost: i.quantity * i.costAtSale,
    discountedQty: i.discountedQty ?? 0
  };
}

export interface Metrics {
  qty: number;
  gross: number;
  discount: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  discountRate: number;
  avgGrossPrice: number;
  avgNetPrice: number;
  avgCost: number;
}

// revenue        = gross − discount
// profit         = revenue − cost
// margin         = profit / revenue   (0 bila revenue = 0)
// discountRate   = discount / gross   (0 bila gross = 0)
// avgGrossPrice  = gross / qty        (0 bila qty = 0)
// avgNetPrice    = revenue / qty      (0 bila qty = 0)
// avgCost        = cost / qty         (0 bila qty = 0)
export function metricsOf(f: Facts): Metrics {
  const revenue = f.gross - f.discount;
  const profit = revenue - f.cost;
  return {
    qty: f.qty,
    gross: f.gross,
    discount: f.discount,
    revenue,
    cost: f.cost,
    profit,
    margin: revenue === 0 ? 0 : profit / revenue,
    discountRate: f.gross === 0 ? 0 : f.discount / f.gross,
    avgGrossPrice: f.qty === 0 ? 0 : f.gross / f.qty,
    avgNetPrice: f.qty === 0 ? 0 : revenue / f.qty,
    avgCost: f.qty === 0 ? 0 : f.cost / f.qty
  };
}

// lineNet = qty × price − discount   (discount null/undefined dianggap 0)
export function lineNetOf(i: {
  quantity: number;
  priceAtSale: number;
  discountAmount?: number | null;
}): number {
  return i.quantity * i.priceAtSale - (i.discountAmount ?? 0);
}

// subtotal      = Σ qty × price
// discountTotal = Σ discountAmount
// total         = subtotal − discountTotal
export function receiptTotals(
  items: { quantity: number; priceAtSale: number; discountAmount: number }[]
): { subtotal: number; discountTotal: number; total: number } {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.priceAtSale, 0);
  const discountTotal = items.reduce((s, i) => s + i.discountAmount, 0);
  return { subtotal, discountTotal, total: subtotal - discountTotal };
}

// delta = (cur − prev) / |prev|   (prev = 0: 0 bila cur = 0, selain itu null)
export function deltaRatio(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return (cur - prev) / Math.abs(prev);
}

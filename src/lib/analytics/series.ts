// Murni + isomorfik: tanpa drizzle-orm/$env/$app, tanpa jam sistem (iterasi
// hari memakai T.addDays/startOfDay yang murni).
import { metricsOf, type Facts } from './facts';
import type { BusinessSummary, ProductSummary } from './core';
import type { BizTime } from '../shared/time';

export function summarizeFacts(
  byProduct: ReadonlyMap<string, Facts>,
  names: Record<string, string>
): ProductSummary[] {
  return Array.from(byProduct.entries()).map(([productId, f]) => {
    const m = metricsOf(f);
    return {
      productId,
      name: names[productId] ?? 'Produk tidak dikenal',
      quantitySold: f.qty,
      revenue: m.revenue,
      cost: m.cost,
      profit: m.profit,
      margin: m.margin
    };
  });
}

// revenue = Σ summary.revenue
// cost    = Σ summary.cost
// profit  = revenue − cost
// margin  = profit / revenue   (0 bila revenue = 0)
export function totalsOf(summaries: ProductSummary[]): BusinessSummary {
  const revenue = summaries.reduce((s, p) => s + p.revenue, 0);
  const cost = summaries.reduce((s, p) => s + p.cost, 0);
  const profit = revenue - cost;
  return { revenue, cost, profit, margin: revenue === 0 ? 0 : profit / revenue };
}

export interface DailyPoint {
  key: string;
  label: string;
  isoDow: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  tx: number;
}

export function fillDailySeries(
  byDay: ReadonlyMap<string, Facts & { txCount: number }>,
  opts: { from: Date; to: Date; T: BizTime }
): DailyPoint[] {
  const { T } = opts;
  const rows: DailyPoint[] = [];
  let cursor = T.startOfDay(opts.from);
  const end = opts.to;
  while (cursor <= end) {
    const key = T.dayKey(cursor);
    const v = byDay.get(key);
    const m = v ? metricsOf(v) : null;
    const w = T.toLocal(cursor);
    rows.push({
      key,
      label: `${w.getUTCDate()}/${w.getUTCMonth() + 1}`,
      isoDow: T.isoDow(cursor),
      revenue: m ? m.revenue : 0,
      cost: v ? v.cost : 0,
      profit: m ? m.profit : 0,
      margin: m ? m.margin : 0,
      tx: v ? v.txCount : 0
    });
    cursor = T.addDays(cursor, 1);
  }
  return rows;
}

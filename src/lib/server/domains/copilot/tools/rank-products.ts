import { and, eq } from 'drizzle-orm';
import { metricsOf, ZERO_FACTS } from '../../../../analytics/facts';
import { fmtInt, fmtPercent, fmtRupiah } from '../../../../shared/format';
import { resolveNamedPeriod, type NamedPeriodKey } from '../../../../shared/period';
import { product } from '../../../db/schema';
import { queryFactsByProduct } from '../../facts/queries';
import type { ToolContext } from '../context';
import { failure, success, type ToolResult } from '../envelope';
import { validateArgs } from '../validate';

const TOOL = 'rank_products';
const periods = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_30d', 'custom'] as const;
const metrics = ['qty', 'revenue', 'profit', 'margin'] as const;

export interface RankProductsData {
  empty: boolean;
  window: { key: NamedPeriodKey; label: string };
  items: { id: string; name: string; qty: number; qtyText: string; revenue: number; revenueText: string; profit: number; profitText: string; margin: number; marginText: string }[];
}

export async function rankProducts(ctx: ToolContext, input: unknown): Promise<ToolResult<RankProductsData>> {
  const checked = validateArgs(input, {
    period: { type: 'string', enum: periods },
    from: { type: 'string' }, to: { type: 'string' },
    by: { type: 'string', enum: metrics }, order: { type: 'string', enum: ['asc', 'desc'] },
    limit: { type: 'integer', min: 1, max: 10 }
  });
  if (!checked.ok) return failure(TOOL, 'INVALID_ARGS', checked.message);
  const period = (checked.value.period ?? 'last_30d') as NamedPeriodKey;
  const from = checked.value.from as string | undefined;
  const to = checked.value.to as string | undefined;
  if (period === 'custom' && (!from || !to)) return failure(TOOL, 'INVALID_ARGS', 'Periode custom memerlukan from dan to.');
  const window = resolveNamedPeriod(period, ctx.tz, ctx.now, from && to ? { from, to } : undefined);
  if (!window.from || !window.to) return failure(TOOL, 'INVALID_ARGS', 'Periode tidak valid.');
  const [products, byProduct] = await Promise.all([
    ctx.db.select({ id: product.id, name: product.name }).from(product).where(and(eq(product.businessId, ctx.businessId), eq(product.isActive, true))),
    queryFactsByProduct(ctx.db, ctx.businessId, { from: window.from, to: window.to })
  ]);
  const by = (checked.value.by ?? 'qty') as (typeof metrics)[number];
  const order = checked.value.order === 'asc' ? 1 : -1;
  const limit = (checked.value.limit ?? 5) as number;
  const items = products.map((item) => {
    const facts = byProduct.get(item.id) ?? { ...ZERO_FACTS, txCount: 0 };
    const value = metricsOf(facts);
    return { id: item.id, name: item.name, qty: value.qty, qtyText: fmtInt(value.qty), revenue: value.revenue, revenueText: fmtRupiah(value.revenue), profit: value.profit, profitText: fmtRupiah(value.profit), margin: value.margin, marginText: fmtPercent(value.margin) };
  }).sort((a, b) => {
    const delta = (a[by] - b[by]) * order;
    return delta || a.name.localeCompare(b.name, 'id-ID');
  }).slice(0, limit);
  return success(TOOL, { empty: items.every((item) => item.qty === 0), window: { key: period, label: window.label }, items }, items.every((item) => item.qty === 0) ? ['Belum ada transaksi pada periode ini.'] : []);
}

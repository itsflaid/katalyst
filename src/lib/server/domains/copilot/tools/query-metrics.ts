import { and, eq } from 'drizzle-orm';
import { makeTime, type BizTime } from '../../../../shared/time';
import { resolveNamedPeriod, type NamedPeriodKey } from '../../../../shared/period';
import { product } from '../../../db/schema';
import { queryFactsByDay, queryFactsByHour, queryProductFacts } from '../../facts/queries';
import {
  buildMetricRows,
  type GroupBy,
  type GroupedFacts,
  type Metric,
  type MetricRow,
  type MetricRowsResult,
  type RowOrder
} from '../../../../analytics/metric-rows';
import type { ToolContext } from '../context';
import { failure, success, type ToolResult } from '../envelope';
import { resolveProduct } from '../product-resolver';
import { validateArgs } from '../validate';

const TOOL = 'query_metrics';
const periods = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_30d', 'last_7d', 'last_90d', 'custom'] as const;
const metrics: Metric[] = ['revenue', 'profit', 'margin', 'qty', 'tx_count', 'discount_total', 'avg_ticket'];
const groupBys: GroupBy[] = ['none', 'product', 'day', 'week', 'month', 'weekday', 'hour'];
const orders: RowOrder[] = ['chronological', 'desc', 'asc'];

export interface QueryMetricsData {
  metric: Metric;
  metricLabel: string;
  groupBy: GroupBy;
  groupLabel: string;
  windowLabel: string;
  scope: { kind: 'all' | 'product'; label: string };
  product?: { id: string; name: string };
  total: { value: number; valueText: string };
  rows: MetricRow[];
  summary: { best: { label: string; valueText: string } | null; worst: { label: string; valueText: string } | null };
  shown: number;
  totalGroups: number;
  truncated: boolean;
  notes: string[];
}

export type QueryMetricsResult =
  | { ok: true; data: QueryMetricsData }
  | { ok: false; code: 'INVALID_ARGS'; message: string };

export function buildQueryMetricsData(input: {
  metric: Metric;
  groupBy: GroupBy;
  period: NamedPeriodKey;
  windowLabel: string;
  product?: { id: string; name: string };
  window: { from: Date; to: Date };
  now: Date;
  T: BizTime;
  byDay?: Map<string, GroupedFacts>;
  byHour?: Map<number, GroupedFacts>;
  byProduct?: Map<string, GroupedFacts>;
  productNames?: Map<string, string>;
  totalTxCount?: number;
  order?: RowOrder;
  limit?: number;
}): QueryMetricsResult {
  const built: MetricRowsResult = buildMetricRows(input);
  if (!built.ok) return built;
  const data: QueryMetricsData = {
    ...built.data,
    windowLabel: input.windowLabel,
    scope: input.product ? { kind: 'product', label: input.product.name } : { kind: 'all', label: 'Semua produk' },
    ...(input.product ? { product: input.product } : {})
  };
  while (JSON.stringify(data).length / 3 > 800 && data.rows.length > 1) {
    if (input.order === 'chronological' || input.order === undefined) data.rows.shift();
    else data.rows.pop();
    data.shown = data.rows.length;
    data.truncated = true;
  }
  return { ok: true, data };
}

export async function queryMetrics(ctx: ToolContext, input: unknown): Promise<ToolResult<QueryMetricsData>> {
  const checked = validateArgs(input, {
    metric: { type: 'string', required: true, enum: metrics },
    group_by: { type: 'string', enum: groupBys },
    period: { type: 'string', enum: periods },
    from: { type: 'string' },
    to: { type: 'string' },
    product: { type: 'string' },
    order: { type: 'string', enum: orders },
    limit: { type: 'integer', min: 1, max: 10 }
  });
  if (!checked.ok) return failure(TOOL, 'INVALID_ARGS', checked.message);
  const metric = checked.value.metric as Metric;
  const groupBy = ((checked.value.group_by ?? 'none') as GroupBy);
  const productQuery = checked.value.product as string | undefined;
  if (productQuery !== undefined && groupBy === 'product') {
    return failure(TOOL, 'INVALID_ARGS', 'Filter produk tidak dipakai bersama kelompok per produk.');
  }
  const period = (checked.value.period ?? 'last_30d') as NamedPeriodKey;
  const from = checked.value.from as string | undefined;
  const to = checked.value.to as string | undefined;
  if (period === 'custom' && (!from || !to)) return failure(TOOL, 'INVALID_ARGS', 'Periode custom memerlukan from dan to.');
  const window = resolveNamedPeriod(period, ctx.tz, ctx.now, from && to ? { from, to } : undefined);
  if (!window.from || !window.to) return failure(TOOL, 'INVALID_ARGS', 'Periode tidak valid.');
  const range = { from: window.from as Date, to: window.to as Date };
  const T = makeTime(ctx.tz);

  let productIds: string[] | undefined;
  let resolvedProduct: { id: string; name: string } | undefined;
  if (productQuery !== undefined) {
    const products = await ctx.db
      .select({ id: product.id, name: product.name })
      .from(product)
      .where(and(eq(product.businessId, ctx.businessId), eq(product.isActive, true)));
    const resolved = resolveProduct(productQuery, products);
    if (resolved.kind === 'not_found') {
      const names = resolved.candidates.map((c) => c.name).join(', ');
      return failure(TOOL, 'PRODUCT_NOT_FOUND', `Produk '${resolved.query}' tidak ditemukan.${names ? ` Yang mirip: ${names}.` : ''}`, resolved.candidates);
    }
    if (resolved.kind === 'ambiguous') {
      return failure(TOOL, 'AMBIGUOUS_PRODUCT', `Ada ${resolved.candidates.length} produk yang cocok dengan '${resolved.query}'.`, resolved.candidates);
    }
    productIds = [resolved.product.id];
    resolvedProduct = resolved.product;
  }

  let byDay: Map<string, GroupedFacts> | undefined;
  let byHour: Map<number, GroupedFacts> | undefined;
  let byProduct: Map<string, GroupedFacts> | undefined;
  let productNames: Map<string, string> | undefined;
  let totalTxCount: number | undefined;
  if (groupBy === 'product') {
    const named = await queryProductFacts(ctx.db, ctx.businessId, range);
    byProduct = named;
    productNames = new Map([...named].map(([id, row]) => [id, row.name] as const));
    if (metric === 'tx_count') {
      const days = await queryFactsByDay(ctx.db, ctx.businessId, range, ctx.tz);
      totalTxCount = [...days.values()].reduce((sum, row) => sum + row.txCount, 0);
    }
  } else if (groupBy === 'hour') {
    byHour = await queryFactsByHour(ctx.db, ctx.businessId, range, ctx.tz, productIds ? { productIds } : undefined);
  } else {
    byDay = await queryFactsByDay(ctx.db, ctx.businessId, range, ctx.tz, productIds ? { productIds } : undefined);
  }

  const built = buildQueryMetricsData({
    metric,
    groupBy,
    period,
    windowLabel: window.label,
    ...(resolvedProduct ? { product: resolvedProduct } : {}),
    window: range,
    now: ctx.now,
    T,
    ...(byDay ? { byDay } : {}),
    ...(byHour ? { byHour } : {}),
    ...(byProduct ? { byProduct } : {}),
    ...(productNames ? { productNames } : {}),
    ...(totalTxCount !== undefined ? { totalTxCount } : {}),
    ...(checked.value.order === undefined ? {} : { order: checked.value.order as RowOrder }),
    ...(checked.value.limit === undefined ? {} : { limit: checked.value.limit as number })
  });
  if (!built.ok) return failure(TOOL, 'INVALID_ARGS', built.message);
  return success(TOOL, built.data, built.data.notes);
}

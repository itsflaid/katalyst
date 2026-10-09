import { metricsOf, sumFacts, type Facts } from '../../../../analytics/facts';
import { fmtInt, fmtPercent, fmtRupiah } from '../../../../shared/format';
import { comparableWindow, resolveNamedPeriod, spanLabel, type NamedPeriodKey } from '../../../../shared/period';
import { makeTime } from '../../../../shared/time';
import { queryFactsByDay } from '../../facts/queries';
import type { ToolContext } from '../context';
import { failure, success, type ToolResult } from '../envelope';
import { validateArgs } from '../validate';

const TOOL = 'get_summary';
const periods = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_30d', 'last_7d', 'last_90d', 'custom'] as const;

export interface SummaryData {
  empty: boolean;
  window: { key: NamedPeriodKey; label: string };
  windowLabel: string;
  baselineLabel: string;
  revenue: number;
  revenueText: string;
  cost: number;
  costText: string;
  profit: number;
  profitText: string;
  margin: number;
  marginText: string;
  txCount: number;
  txCountText: string;
}

export function buildSummaryData(input: {
  facts: Facts;
  txCount: number;
  empty: boolean;
  period: NamedPeriodKey;
  windowLabel: string;
  baselineLabel?: string;
}): SummaryData {
  const metrics = metricsOf(input.facts);
  return {
    empty: input.empty,
    window: { key: input.period, label: input.windowLabel },
    windowLabel: input.windowLabel,
    baselineLabel: input.baselineLabel ?? '',
    revenue: metrics.revenue,
    revenueText: fmtRupiah(metrics.revenue),
    cost: metrics.cost,
    costText: fmtRupiah(metrics.cost),
    profit: metrics.profit,
    profitText: fmtRupiah(metrics.profit),
    margin: metrics.margin,
    marginText: fmtPercent(metrics.margin),
    txCount: input.txCount,
    txCountText: fmtInt(input.txCount)
  };
}

export async function getSummary(ctx: ToolContext, input: unknown): Promise<ToolResult<SummaryData>> {
  const checked = validateArgs(input, {
    period: { type: 'string', required: true, enum: periods },
    from: { type: 'string' },
    to: { type: 'string' }
  });
  if (!checked.ok) return failure(TOOL, 'INVALID_ARGS', checked.message);
  const period = checked.value.period as NamedPeriodKey;
  const from = checked.value.from as string | undefined;
  const to = checked.value.to as string | undefined;
  if (period === 'custom' && (!from || !to)) return failure(TOOL, 'INVALID_ARGS', 'Periode custom memerlukan from dan to.');
  const window = resolveNamedPeriod(period, ctx.tz, ctx.now, from && to ? { from, to } : undefined);
  if (!window.from || !window.to) return failure(TOOL, 'INVALID_ARGS', 'Periode tidak valid.');
  const rows = await queryFactsByDay(ctx.db, ctx.businessId, { from: window.from, to: window.to }, ctx.tz);
  const values = [...rows.values()];
  const txCount = values.reduce((total, row) => total + row.txCount, 0);
  const empty = txCount === 0;
  const previous = comparableWindow({ from: window.from, to: window.to, key: period }, ctx.tz, ctx.now);
  const data = buildSummaryData({
    facts: sumFacts(values),
    txCount,
    empty,
    period,
    windowLabel: spanLabel(window.from, window.to, ctx.tz),
    baselineLabel: spanLabel(previous.from, previous.to, ctx.tz)
  });
  const partial = window.to.getTime() < makeTime(ctx.tz).endOfDay(window.to).getTime();
  return success(TOOL, data, empty ? ['Belum ada transaksi pada periode ini.'] : partial ? ['Periode berjalan belum penuh.'] : []);
}

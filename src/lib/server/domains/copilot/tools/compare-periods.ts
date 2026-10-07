import { deltaRatio, metricsOf, sumFacts, type Facts } from '../../../../analytics/facts';
import { fmtDelta, fmtPercent, fmtPoints, fmtRupiah } from '../../../../shared/format';
import { comparableWindow, resolveNamedPeriod, spanLabel, type NamedPeriodKey } from '../../../../shared/period';
import { makeTime } from '../../../../shared/time';
import { queryFactsByDay } from '../../facts/queries';
import type { ToolContext } from '../context';
import { failure, success, type ToolResult } from '../envelope';
import { validateArgs } from '../validate';

const TOOL = 'compare_periods';
const periods = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_30d', 'custom'] as const;

export interface ComparePeriodsData {
  empty: boolean;
  window: { key: NamedPeriodKey; label: string };
  windowLabel: string;
  baselineWindow: { label: string };
  baselineLabel: string;
  current: { revenue: number; revenueText: string; profit: number; profitText: string; margin: number; marginText: string };
  baseline: { revenue: number; revenueText: string; profit: number; profitText: string; margin: number; marginText: string };
  change: { revenue: number | null; revenueText: string; profit: number | null; profitText: string; marginPoints: number; marginPointsText: string };
}

export function buildComparePeriodsData(input: {
  current: Facts;
  baseline: Facts;
  empty: boolean;
  period: NamedPeriodKey;
  windowLabel: string;
  baselineLabel: string;
}): ComparePeriodsData {
  const current = metricsOf(input.current);
  const baseline = metricsOf(input.baseline);
  const revenueChange = deltaRatio(current.revenue, baseline.revenue);
  const profitChange = deltaRatio(current.profit, baseline.profit);
  const marginPoints = current.margin - baseline.margin;
  return {
    empty: input.empty,
    window: { key: input.period, label: input.windowLabel },
    windowLabel: input.windowLabel,
    baselineWindow: { label: input.baselineLabel },
    baselineLabel: input.baselineLabel,
    current: { revenue: current.revenue, revenueText: fmtRupiah(current.revenue), profit: current.profit, profitText: fmtRupiah(current.profit), margin: current.margin, marginText: fmtPercent(current.margin) },
    baseline: { revenue: baseline.revenue, revenueText: fmtRupiah(baseline.revenue), profit: baseline.profit, profitText: fmtRupiah(baseline.profit), margin: baseline.margin, marginText: fmtPercent(baseline.margin) },
    change: { revenue: revenueChange, revenueText: fmtDelta(revenueChange), profit: profitChange, profitText: fmtDelta(profitChange), marginPoints, marginPointsText: fmtPoints(marginPoints) }
  };
}

export async function comparePeriods(ctx: ToolContext, input: unknown): Promise<ToolResult<ComparePeriodsData>> {
  const checked = validateArgs(input, { period: { type: 'string', required: true, enum: periods }, from: { type: 'string' }, to: { type: 'string' } });
  if (!checked.ok) return failure(TOOL, 'INVALID_ARGS', checked.message);
  const period = checked.value.period as NamedPeriodKey;
  const from = checked.value.from as string | undefined;
  const to = checked.value.to as string | undefined;
  if (period === 'custom' && (!from || !to)) return failure(TOOL, 'INVALID_ARGS', 'Periode custom memerlukan from dan to.');
  const window = resolveNamedPeriod(period, ctx.tz, ctx.now, from && to ? { from, to } : undefined);
  if (!window.from || !window.to) return failure(TOOL, 'INVALID_ARGS', 'Periode tidak valid.');
  const previous = comparableWindow({ from: window.from, to: window.to, key: period }, ctx.tz, ctx.now);
  const [currentRows, previousRows] = await Promise.all([
    queryFactsByDay(ctx.db, ctx.businessId, { from: window.from, to: window.to }, ctx.tz),
    queryFactsByDay(ctx.db, ctx.businessId, previous, ctx.tz)
  ]);
  const empty = currentRows.size === 0;
  const data = buildComparePeriodsData({
    current: sumFacts([...currentRows.values()]),
    baseline: sumFacts([...previousRows.values()]),
    empty,
    period,
    windowLabel: spanLabel(window.from, window.to, ctx.tz),
    baselineLabel: spanLabel(previous.from, previous.to, ctx.tz)
  });
  const notes = empty
    ? ['Belum ada transaksi pada periode ini.']
    : [
        ...(previous.clamped ? ['Periode pembanding dipotong mengikuti panjang bulan lalu.'] : []),
        ...(window.to.getTime() < makeTime(ctx.tz).endOfDay(window.to).getTime() ? ['Periode berjalan belum penuh.'] : [])
      ];
  return success(TOOL, data, notes);
}

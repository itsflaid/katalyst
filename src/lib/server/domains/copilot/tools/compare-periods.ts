import { deltaRatio, metricsOf, sumFacts } from '../../../../analytics/facts';
import { fmtDelta, fmtPoints, fmtRupiah } from '../../../../shared/format';
import { comparableWindow, resolveNamedPeriod, type NamedPeriodKey } from '../../../../shared/period';
import { queryFactsByDay } from '../../facts/queries';
import type { ToolContext } from '../context';
import { failure, success, type ToolResult } from '../envelope';
import { validateArgs } from '../validate';

const TOOL = 'compare_periods';
const periods = ['today', 'this_week', 'this_month', 'last_30d', 'custom'] as const;

export interface ComparePeriodsData {
  empty: boolean;
  window: { key: NamedPeriodKey; label: string };
  baselineWindow: { label: string };
  current: { revenue: number; revenueText: string; profit: number; profitText: string; margin: number };
  baseline: { revenue: number; revenueText: string; profit: number; profitText: string; margin: number };
  change: { revenue: number | null; revenueText: string; profit: number | null; profitText: string; marginPoints: number; marginPointsText: string };
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
  const previous = comparableWindow(window as typeof window & { from: Date; to: Date });
  const [currentRows, previousRows] = await Promise.all([
    queryFactsByDay(ctx.db, ctx.businessId, { from: window.from, to: window.to }, ctx.tz),
    queryFactsByDay(ctx.db, ctx.businessId, previous, ctx.tz)
  ]);
  const current = metricsOf(sumFacts([...currentRows.values()]));
  const baseline = metricsOf(sumFacts([...previousRows.values()]));
  const revenueChange = deltaRatio(current.revenue, baseline.revenue);
  const profitChange = deltaRatio(current.profit, baseline.profit);
  const marginPoints = current.margin - baseline.margin;
  return success(TOOL, {
    empty: currentRows.size === 0,
    window: { key: period, label: window.label },
    baselineWindow: { label: 'Periode sebelumnya dengan panjang yang sama' },
    current: { revenue: current.revenue, revenueText: fmtRupiah(current.revenue), profit: current.profit, profitText: fmtRupiah(current.profit), margin: current.margin },
    baseline: { revenue: baseline.revenue, revenueText: fmtRupiah(baseline.revenue), profit: baseline.profit, profitText: fmtRupiah(baseline.profit), margin: baseline.margin },
    change: { revenue: revenueChange, revenueText: fmtDelta(revenueChange), profit: profitChange, profitText: fmtDelta(profitChange), marginPoints, marginPointsText: fmtPoints(marginPoints) }
  }, currentRows.size === 0 ? ['Belum ada transaksi pada periode ini.'] : []);
}

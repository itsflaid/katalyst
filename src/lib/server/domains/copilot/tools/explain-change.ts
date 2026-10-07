import { decomposeProfitMaps, type ProfitFactor } from '../../../../analytics/decompose';
import { metricsOf, sumFacts } from '../../../../analytics/facts';
import { fmtPercent, fmtRupiah } from '../../../../shared/format';
import { comparableWindow, resolveNamedPeriod, spanLabel, type NamedPeriodKey } from '../../../../shared/period';
import { makeTime } from '../../../../shared/time';
import { queryFactsByProduct } from '../../facts/queries';
import type { ToolContext } from '../context';
import { failure, success, type ToolResult } from '../envelope';
import { validateArgs } from '../validate';

const TOOL = 'explain_change';
const periods = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_30d', 'custom'] as const;

export interface ExplainChangeData {
  empty: boolean;
  window: { key: NamedPeriodKey; label: string };
  windowLabel: string;
  baselineLabel: string;
  profitDelta: number;
  profitDeltaText: string;
  factors: { key: 'volume' | 'price' | 'discount' | 'cost'; amount: number; amountText: string; share: number; shareText: string }[];
}

export function buildExplainChangeData(input: {
  factors: ProfitFactor;
  profitDelta: number;
  empty: boolean;
  period: NamedPeriodKey;
  windowLabel: string;
  baselineLabel: string;
}): ExplainChangeData {
  const values = (Object.entries(input.factors) as [keyof ProfitFactor, number][]).map(([key, amount]) => ({
    key,
    amount,
    amountText: fmtRupiah(amount),
    share: input.profitDelta === 0 ? 0 : amount / input.profitDelta,
    shareText: fmtPercent(input.profitDelta === 0 ? 0 : amount / input.profitDelta)
  }));
  return {
    empty: input.empty,
    window: { key: input.period, label: input.windowLabel },
    windowLabel: input.windowLabel,
    baselineLabel: input.baselineLabel,
    profitDelta: input.profitDelta,
    profitDeltaText: fmtRupiah(input.profitDelta),
    factors: values
  };
}

export async function explainChange(ctx: ToolContext, input: unknown): Promise<ToolResult<ExplainChangeData>> {
  const checked = validateArgs(input, { period: { type: 'string', required: true, enum: periods }, from: { type: 'string' }, to: { type: 'string' } });
  if (!checked.ok) return failure(TOOL, 'INVALID_ARGS', checked.message);
  const period = checked.value.period as NamedPeriodKey;
  const from = checked.value.from as string | undefined;
  const to = checked.value.to as string | undefined;
  if (period === 'custom' && (!from || !to)) return failure(TOOL, 'INVALID_ARGS', 'Periode custom memerlukan from dan to.');
  const window = resolveNamedPeriod(period, ctx.tz, ctx.now, from && to ? { from, to } : undefined);
  if (!window.from || !window.to) return failure(TOOL, 'INVALID_ARGS', 'Periode tidak valid.');
  const previous = comparableWindow({ from: window.from, to: window.to, key: period }, ctx.tz, ctx.now);
  const [current, baseline] = await Promise.all([
    queryFactsByProduct(ctx.db, ctx.businessId, { from: window.from, to: window.to }),
    queryFactsByProduct(ctx.db, ctx.businessId, previous)
  ]);
  const currentFacts = new Map([...current].map(([id, row]) => [id, row]));
  const baselineFacts = new Map([...baseline].map(([id, row]) => [id, row]));
  const profitDelta = metricsOf(sumFacts([...current.values()])).profit - metricsOf(sumFacts([...baseline.values()])).profit;
  const empty = current.size === 0;
  const data = buildExplainChangeData({
    factors: decomposeProfitMaps(currentFacts, baselineFacts),
    profitDelta,
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

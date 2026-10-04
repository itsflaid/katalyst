import { decomposeProfitMaps } from '../../../../analytics/decompose';
import { metricsOf, sumFacts } from '../../../../analytics/facts';
import { fmtPercent, fmtRupiah } from '../../../../shared/format';
import { comparableWindow, resolveNamedPeriod, type NamedPeriodKey } from '../../../../shared/period';
import { queryFactsByProduct } from '../../facts/queries';
import type { ToolContext } from '../context';
import { failure, success, type ToolResult } from '../envelope';
import { validateArgs } from '../validate';

const TOOL = 'explain_change';
const periods = ['today', 'this_week', 'this_month', 'last_30d', 'custom'] as const;

export interface ExplainChangeData {
  empty: boolean;
  window: { key: NamedPeriodKey; label: string };
  profitDelta: number;
  profitDeltaText: string;
  factors: { key: 'volume' | 'price' | 'discount' | 'cost'; amount: number; amountText: string; share: number; shareText: string }[];
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
  const previous = comparableWindow(window as typeof window & { from: Date; to: Date });
  const [current, baseline] = await Promise.all([
    queryFactsByProduct(ctx.db, ctx.businessId, { from: window.from, to: window.to }),
    queryFactsByProduct(ctx.db, ctx.businessId, previous)
  ]);
  const currentFacts = new Map([...current].map(([id, row]) => [id, row]));
  const baselineFacts = new Map([...baseline].map(([id, row]) => [id, row]));
  const profitDelta = metricsOf(sumFacts([...current.values()])).profit - metricsOf(sumFacts([...baseline.values()])).profit;
  const factors = decomposeProfitMaps(currentFacts, baselineFacts);
  const values = (Object.entries(factors) as [keyof typeof factors, number][]).map(([key, amount]) => ({
    key,
    amount,
    amountText: fmtRupiah(amount),
    share: profitDelta === 0 ? 0 : amount / profitDelta,
    shareText: fmtPercent(profitDelta === 0 ? 0 : amount / profitDelta)
  }));
  return success(TOOL, { empty: current.size === 0, window: { key: period, label: window.label }, profitDelta, profitDeltaText: fmtRupiah(profitDelta), factors: values }, current.size === 0 ? ['Belum ada transaksi pada periode ini.'] : ['Perbandingan memakai periode sebelumnya dengan panjang yang sama.']);
}

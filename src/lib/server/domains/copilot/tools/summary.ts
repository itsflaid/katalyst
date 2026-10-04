import { metricsOf, sumFacts } from '../../../../analytics/facts';
import { fmtInt, fmtPercent, fmtRupiah } from '../../../../shared/format';
import { resolveNamedPeriod, type NamedPeriodKey } from '../../../../shared/period';
import { queryFactsByDay } from '../../facts/queries';
import type { ToolContext } from '../context';
import { failure, success, type ToolResult } from '../envelope';
import { validateArgs } from '../validate';

const TOOL = 'get_summary';
const periods = ['today', 'this_week', 'this_month', 'last_30d', 'custom'] as const;

export interface SummaryData {
  empty: boolean;
  window: { key: NamedPeriodKey; label: string };
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
  const metrics = metricsOf(sumFacts(values));
  const txCount = values.reduce((total, row) => total + row.txCount, 0);
  const empty = txCount === 0;
  return success(
    TOOL,
    {
      empty,
      window: { key: period, label: window.label },
      revenue: metrics.revenue,
      revenueText: fmtRupiah(metrics.revenue),
      cost: metrics.cost,
      costText: fmtRupiah(metrics.cost),
      profit: metrics.profit,
      profitText: fmtRupiah(metrics.profit),
      margin: metrics.margin,
      marginText: fmtPercent(metrics.margin),
      txCount,
      txCountText: fmtInt(txCount)
    },
    empty ? ['Belum ada transaksi pada periode ini.'] : []
  );
}

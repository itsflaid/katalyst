import { eq } from 'drizzle-orm';
import { metricsOf, ZERO_FACTS, type Facts } from '../../../../analytics/facts';
import { fmtInt, fmtPercent, fmtRupiah } from '../../../../shared/format';
import { resolveNamedPeriod, type NamedPeriodKey } from '../../../../shared/period';
import { product } from '../../../db/schema';
import { queryFactsByProduct } from '../../facts/queries';
import type { ToolContext } from '../context';
import { failure, success, type ToolResult } from '../envelope';
import { validateArgs } from '../validate';

const TOOL = 'rank_products';
const periods = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_30d', 'last_7d', 'last_90d', 'custom'] as const;
const metrics = ['qty', 'revenue', 'profit', 'margin'] as const;
type MetricKey = (typeof metrics)[number];

export interface RankProductsItem {
  id: string;
  name: string;
  qty: number;
  qtyText: string;
  revenue: number;
  revenueText: string;
  profit: number;
  profitText: string;
  margin: number;
  marginText: string;
  inactive: boolean;
  inactiveText?: string;
}

export interface RankProductsSummary {
  withSales: number;
  withSalesText: string;
  unsold: number;
  unsoldText: string;
  shown: number;
  shownText: string;
  truncated: boolean;
  unsoldNames: string[];
  lines: string[];
}

export interface RankProductsData {
  empty: boolean;
  window: { key: NamedPeriodKey; label: string };
  summary: RankProductsSummary;
  items: RankProductsItem[];
}

export interface RankProductsOptions {
  by?: MetricKey;
  order?: 'asc' | 'desc';
  limit?: number;
  includeUnsold?: boolean;
}

type ProductRow = { id: string; name: string; isActive: boolean };
type SalesMap = Map<string, Facts>;

export function buildRankProductsData(
  products: ProductRow[],
  byProduct: SalesMap,
  args: RankProductsOptions
): { empty: boolean; items: RankProductsItem[]; summary: RankProductsSummary; notes: string[] } {
  const by = args.by ?? 'qty';
  const order = args.order === 'asc' ? 1 : -1;
  const limit = args.limit ?? 5;
  const includeUnsold = args.includeUnsold ?? false;
  // withSales = produk dengan qty > 0
  // unsold    = produk aktif dengan qty = 0
  // empty     = withSales = 0
  const rows = products.map((item) => {
    const facts = byProduct.get(item.id) ?? { ...ZERO_FACTS };
    const value = metricsOf(facts);
    return { product: item, qty: value.qty, revenue: value.revenue, profit: value.profit, margin: value.margin };
  });
  const withSales = rows.filter((row) => row.qty > 0).length;
  const unsoldRows = rows
    .filter((row) => row.product.isActive && row.qty === 0)
    .sort((a, b) => a.product.name.localeCompare(b.product.name, 'id-ID'));
  const unsold = unsoldRows.length;
  const empty = withSales === 0;
  const candidates = rows.filter((row) => row.qty > 0 || (includeUnsold && row.product.isActive && row.qty === 0));
  // peringkat = urut menurut ukuran × arah, seri menurut nama
  const ranked = [...candidates].sort((a, b) => {
    const delta = (a[by] - b[by]) * order;
    return delta || a.product.name.localeCompare(b.product.name, 'id-ID');
  });
  const items: RankProductsItem[] = ranked.slice(0, limit).map((row) => ({
    id: row.product.id,
    name: row.product.name,
    qty: row.qty,
    qtyText: fmtInt(row.qty),
    revenue: row.revenue,
    revenueText: fmtRupiah(row.revenue),
    profit: row.profit,
    profitText: fmtRupiah(row.profit),
    margin: row.margin,
    marginText: fmtPercent(row.margin),
    inactive: !row.product.isActive,
    ...(row.product.isActive ? {} : { inactiveText: '(nonaktif)' })
  }));
  const shown = items.length;
  // truncated = kandidat > tampil
  const truncated = candidates.length > shown;
  const unsoldNames = unsold > 0 && !includeUnsold ? unsoldRows.slice(0, 5).map((row) => row.product.name) : [];
  const head = `${fmtInt(withSales)} produk terjual`;
  const tail = unsold > 0 ? `; ${fmtInt(unsold)} produk aktif belum terjual${unsoldNames.length > 0 ? `: ${unsoldNames.join(', ')}` : ''}` : '';
  const lines = candidates.length === 0 && unsold === 0 ? ['0 produk terjual.'] : [`${head}${tail}.`];
  const notes = empty
    ? ['Belum ada transaksi pada periode ini.']
    : [
        ...(truncated ? [`Daftar dipotong: tampil ${shown} dari ${candidates.length}.`] : []),
        ...(unsold > 0 && !includeUnsold ? [`${unsold} produk aktif belum terjual pada periode ini.`] : [])
      ];
  const summary: RankProductsSummary = {
    withSales,
    withSalesText: fmtInt(withSales),
    unsold,
    unsoldText: fmtInt(unsold),
    shown,
    shownText: fmtInt(shown),
    truncated,
    unsoldNames,
    lines
  };
  return { empty, items, summary, notes };
}

export async function rankProducts(ctx: ToolContext, input: unknown): Promise<ToolResult<RankProductsData>> {
  const checked = validateArgs(input, {
    period: { type: 'string', enum: periods },
    from: { type: 'string' }, to: { type: 'string' },
    by: { type: 'string', enum: metrics }, order: { type: 'string', enum: ['asc', 'desc'] },
    limit: { type: 'integer', min: 1, max: 10 },
    include_unsold: { type: 'boolean' }
  });
  if (!checked.ok) return failure(TOOL, 'INVALID_ARGS', checked.message);
  const period = (checked.value.period ?? 'last_30d') as NamedPeriodKey;
  const from = checked.value.from as string | undefined;
  const to = checked.value.to as string | undefined;
  if (period === 'custom' && (!from || !to)) return failure(TOOL, 'INVALID_ARGS', 'Periode custom memerlukan from dan to.');
  const window = resolveNamedPeriod(period, ctx.tz, ctx.now, from && to ? { from, to } : undefined);
  if (!window.from || !window.to) return failure(TOOL, 'INVALID_ARGS', 'Periode tidak valid.');
  const [products, byProduct] = await Promise.all([
    ctx.db.select({ id: product.id, name: product.name, isActive: product.isActive }).from(product).where(eq(product.businessId, ctx.businessId)),
    queryFactsByProduct(ctx.db, ctx.businessId, { from: window.from, to: window.to })
  ]);
  const by = (checked.value.by ?? 'qty') as MetricKey;
  const order = checked.value.order === 'asc' ? 'asc' : 'desc';
  const limit = (checked.value.limit ?? 5) as number;
  const includeUnsold = (checked.value.include_unsold ?? false) as boolean;
  const built = buildRankProductsData(products, byProduct, { by, order, limit, includeUnsold });
  return success(TOOL, { empty: built.empty, window: { key: period, label: window.label }, summary: built.summary, items: built.items }, built.notes);
}

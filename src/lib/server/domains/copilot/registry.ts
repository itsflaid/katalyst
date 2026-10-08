import { getSummary } from './tools/summary';
import { rankProducts } from './tools/rank-products';
import { comparePeriods } from './tools/compare-periods';
import { getInventory } from './tools/inventory';
import { explainChange } from './tools/explain-change';
import { simulatePrice } from './tools/simulate-price';
import { queryMetrics } from './tools/query-metrics';
import type { ToolContext } from './context';
import type { ToolResult } from './envelope';
import { sanitizeText } from './sanitize';

export interface RegisteredTool {
  name: string;
  description: string;
  maxQueries: number;
  enabled: boolean;
  parameters: Record<string, unknown>;
  run: (ctx: ToolContext, args: unknown) => Promise<ToolResult<unknown>>;
}

const PERIOD = { type: 'string', enum: ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_30d', 'custom'] };

export const TOOL_REGISTRY: RegisteredTool[] = [
  {
    name: 'get_summary',
    description: 'Ringkasan omzet, modal, profit, margin, dan jumlah struk pada periode yang diminta.',
    maxQueries: 1,
    enabled: true,
    parameters: {
      type: 'object',
      properties: {
        period: PERIOD,
        from: { type: 'string' },
        to: { type: 'string' }
      },
      required: ['period'],
      additionalProperties: false
    },
    run: getSummary
  },
  {
    name: 'rank_products', description: 'Ranking produk menurut unit, omzet, profit, atau margin; isi include_unsold true bila ditanya produk yang tidak laku atau belum terjual.', maxQueries: 2, enabled: true,
    parameters: { type: 'object', properties: { period: PERIOD, from: { type: 'string' }, to: { type: 'string' }, by: { type: 'string', enum: ['qty', 'revenue', 'profit', 'margin'] }, order: { type: 'string', enum: ['asc', 'desc'] }, limit: { type: 'integer' }, include_unsold: { type: 'boolean' } }, additionalProperties: false }, run: rankProducts
  },
  {
    name: 'compare_periods', description: 'Membandingkan omzet, profit, dan margin periode dengan periode sebelumnya yang sepadan.', maxQueries: 2, enabled: true,
    parameters: { type: 'object', properties: { period: PERIOD, from: { type: 'string' }, to: { type: 'string' } }, required: ['period'], additionalProperties: false }, run: comparePeriods
  },
  {
    name: 'get_inventory', description: 'Stok produk aktif: habis, menipis, hampir habis, mati; ringkasan, estimasi hari, dan nilai stok nonaktif terpisah.', maxQueries: 2, enabled: true,
    parameters: { type: 'object', properties: { filter: { type: 'string', enum: ['all', 'low', 'out', 'urgent', 'dead'] }, limit: { type: 'integer' } }, additionalProperties: false }, run: getInventory
  },
  {
    name: 'explain_change', description: 'Menjelaskan perubahan profit dengan faktor volume, harga, diskon, dan modal.', maxQueries: 2, enabled: true,
    parameters: { type: 'object', properties: { period: PERIOD, from: { type: 'string' }, to: { type: 'string' } }, required: ['period'], additionalProperties: false }, run: explainChange
  },
  {
    name: 'simulate_price', description: 'Mensimulasikan harga, diskon, atau perubahan volume untuk satu produk aktif.', maxQueries: 2, enabled: true,
    parameters: { type: 'object', properties: { product: { type: 'string' }, period: PERIOD, from: { type: 'string' }, to: { type: 'string' }, priceDelta: { type: 'integer' }, price: { type: 'integer' }, discountPct: { type: 'integer' }, volumePct: { type: 'integer' } }, required: ['product'], additionalProperties: false }, run: simulatePrice
  },
  {
    name: 'query_metrics', description: 'Menjawab pola waktu dan ukuran dari data: hari atau jam paling ramai dan sepi, omzet per hari, minggu, atau bulan, margin per hari, total diskon, rata-rata belanja per struk, dan pola per produk. Ukuran: omzet sama dengan revenue, untung atau laba sama dengan profit, margin, unit atau jumlah terjual sama dengan qty, jumlah struk atau transaksi sama dengan tx_count, total diskon sama dengan discount_total, rata-rata belanja per struk sama dengan avg_ticket. Kelompok: none total, product per produk, day per hari, week per minggu, month per bulan, weekday per nama hari, hour per jam; "paling ramai" berarti tx_count dengan weekday atau hour dan order desc.', maxQueries: 2, enabled: true,
    parameters: { type: 'object', properties: { metric: { type: 'string', enum: ['revenue', 'profit', 'margin', 'qty', 'tx_count', 'discount_total', 'avg_ticket'] }, group_by: { type: 'string', enum: ['none', 'product', 'day', 'week', 'month', 'weekday', 'hour'] }, period: PERIOD, from: { type: 'string' }, to: { type: 'string' }, product: { type: 'string' }, order: { type: 'string', enum: ['chronological', 'desc', 'asc'] }, limit: { type: 'integer' } }, required: ['metric'], additionalProperties: false }, run: queryMetrics
  }
];

export function findTool(name: string): RegisteredTool | undefined {
  return TOOL_REGISTRY.find((tool) => tool.enabled && tool.name === name);
}

// Kunci teknis yang bukan teks bebas; nilainya diteruskan apa adanya.
const KEEP_KEYS = new Set(['id', 'productId', 'conversationId', 'key', 'code', 'simulatorLink']);

// Teks dari database adalah data; baris baru dan karakter tak kasatmata dibuang
// agar tidak lolos sebagai perintah ke model. Idempoten.
export function sanitizeResult<T>(value: T): T {
  if (typeof value === 'string') return sanitizeText(value, 200) as T;
  if (Array.isArray(value)) return value.map(sanitizeResult) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [itemKey, item] of Object.entries(value as Record<string, unknown>)) {
      out[itemKey] = KEEP_KEYS.has(itemKey) ? item : sanitizeResult(item);
    }
    return out as T;
  }
  return value;
}

export async function runTool(tool: RegisteredTool, ctx: ToolContext, args: unknown): Promise<ToolResult<unknown>> {
  return sanitizeResult(await tool.run(ctx, args));
}

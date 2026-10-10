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

const PERIOD = { type: 'string', enum: ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_30d', 'last_7d', 'last_90d', 'custom'] };

export const TOOL_REGISTRY: RegisteredTool[] = [
  {
    name: 'get_summary',
    description: 'Ringkasan omzet, modal, profit, margin, struk.',
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
    name: 'rank_products', description: 'Ranking produk (unit, omzet, profit, margin); "tidak laku" atau belum terjual → include_unsold true.', maxQueries: 2, enabled: true,
    parameters: { type: 'object', properties: { period: PERIOD, from: { type: 'string' }, to: { type: 'string' }, by: { type: 'string', enum: ['qty', 'revenue', 'profit', 'margin'] }, order: { type: 'string', enum: ['asc', 'desc'] }, limit: { type: 'integer' }, include_unsold: { type: 'boolean' } }, additionalProperties: false }, run: rankProducts
  },
  {
    name: 'compare_periods', description: 'Bandingkan omzet, profit, margin vs periode sebelumnya.', maxQueries: 2, enabled: true,
    parameters: { type: 'object', properties: { period: PERIOD, from: { type: 'string' }, to: { type: 'string' } }, required: ['period'], additionalProperties: false }, run: comparePeriods
  },
  {
    name: 'get_inventory', description: 'Stok aktif: habis, menipis, hampir habis, mati; + estimasi hari; nonaktif terpisah.', maxQueries: 2, enabled: true,
    parameters: { type: 'object', properties: { filter: { type: 'string', enum: ['all', 'low', 'out', 'urgent', 'dead'] }, limit: { type: 'integer' } }, additionalProperties: false }, run: getInventory
  },
  {
    name: 'explain_change', description: 'Uraian perubahan profit: volume, harga, diskon, modal.', maxQueries: 2, enabled: true,
    parameters: { type: 'object', properties: { period: PERIOD, from: { type: 'string' }, to: { type: 'string' } }, required: ['period'], additionalProperties: false }, run: explainChange
  },
  {
    name: 'simulate_price', description: 'Simulasi harga/diskon/volume satu produk aktif.', maxQueries: 2, enabled: true,
    parameters: { type: 'object', properties: { product: { type: 'string' }, period: PERIOD, from: { type: 'string' }, to: { type: 'string' }, priceDelta: { type: 'integer' }, price: { type: 'integer' }, discountPct: { type: 'integer' }, volumePct: { type: 'integer' }, sensitivity: { type: 'string', enum: ['low', 'medium', 'high'] } }, required: ['product'], additionalProperties: false }, run: simulatePrice
  },
  {
    name: 'query_metrics', description: 'Ukuran: omzet=revenue, untung=laba=profit, unit=qty, struk=tx_count, total diskon=discount_total, rata-rata per struk=avg_ticket. Kelompok: none total, product, day, week, month, weekday, hour; "paling ramai"=tx_count+weekday/hour+order desc.', maxQueries: 2, enabled: true,
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

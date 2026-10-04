import { getSummary } from './tools/summary';
import { rankProducts } from './tools/rank-products';
import { comparePeriods } from './tools/compare-periods';
import { getInventory } from './tools/inventory';
import type { ToolContext } from './context';
import type { ToolResult } from './envelope';

export interface RegisteredTool {
  name: string;
  description: string;
  maxQueries: number;
  enabled: boolean;
  parameters: Record<string, unknown>;
  run: (ctx: ToolContext, args: unknown) => Promise<ToolResult<unknown>>;
}

export const TOOL_REGISTRY: RegisteredTool[] = [
  {
    name: 'get_summary',
    description: 'Ringkasan omzet, modal, profit, margin, dan jumlah struk pada periode yang diminta.',
    maxQueries: 1,
    enabled: true,
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', 'this_week', 'this_month', 'last_30d', 'custom'] },
        from: { type: 'string' },
        to: { type: 'string' }
      },
      required: ['period'],
      additionalProperties: false
    },
    run: getSummary
  },
  {
    name: 'rank_products', description: 'Ranking produk aktif menurut unit, omzet, profit, atau margin.', maxQueries: 2, enabled: true,
    parameters: { type: 'object', properties: { period: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, by: { type: 'string', enum: ['qty', 'revenue', 'profit', 'margin'] }, order: { type: 'string', enum: ['asc', 'desc'] }, limit: { type: 'integer' } }, additionalProperties: false }, run: rankProducts
  },
  {
    name: 'compare_periods', description: 'Membandingkan omzet, profit, dan margin periode dengan periode sebelumnya yang sepadan.', maxQueries: 2, enabled: true,
    parameters: { type: 'object', properties: { period: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } }, required: ['period'], additionalProperties: false }, run: comparePeriods
  },
  {
    name: 'get_inventory', description: 'Stok produk aktif, produk habis, dan produk menipis dibanding ambang stoknya.', maxQueries: 2, enabled: true,
    parameters: { type: 'object', properties: { filter: { type: 'string', enum: ['all', 'low'] }, limit: { type: 'integer' } }, additionalProperties: false }, run: getInventory
  }
];

export function findTool(name: string): RegisteredTool | undefined {
  return TOOL_REGISTRY.find((tool) => tool.enabled && tool.name === name);
}

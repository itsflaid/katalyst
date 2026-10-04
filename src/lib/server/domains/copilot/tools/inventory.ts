import { and, eq } from 'drizzle-orm';
import { fmtInt, fmtRupiah } from '../../../../shared/format';
import { makeTime } from '../../../../shared/time';
import { product } from '../../../db/schema';
import { queryFactsByProduct } from '../../facts/queries';
import type { ToolContext } from '../context';
import { failure, success, type ToolResult } from '../envelope';
import { validateArgs } from '../validate';

const TOOL = 'get_inventory';
const DAYS = 14;

export interface InventoryData {
  empty: boolean;
  items: { id: string; name: string; stock: number; stockText: string; minStock: number; sold14: number; sold14Text: string; stockValue: number; stockValueText: string; status: 'empty' | 'low' | 'ok' }[];
}

export async function getInventory(ctx: ToolContext, input: unknown): Promise<ToolResult<InventoryData>> {
  const checked = validateArgs(input, { filter: { type: 'string', enum: ['all', 'low'] }, limit: { type: 'integer', min: 1, max: 10 } });
  if (!checked.ok) return failure(TOOL, 'INVALID_ARGS', checked.message);
  const T = makeTime(ctx.tz);
  const since = T.startOfDay(T.addDays(ctx.now, -(DAYS - 1)));
  const [products, sales] = await Promise.all([
    ctx.db.select({ id: product.id, name: product.name, stock: product.stock, minStock: product.minStock, costPrice: product.costPrice }).from(product).where(and(eq(product.businessId, ctx.businessId), eq(product.isActive, true))),
    queryFactsByProduct(ctx.db, ctx.businessId, { from: since, to: ctx.now })
  ]);
  const filter = checked.value.filter ?? 'all';
  const limit = (checked.value.limit ?? 10) as number;
  const items = products.map((item) => {
    const sold14 = sales.get(item.id)?.qty ?? 0;
    const status: 'empty' | 'low' | 'ok' = item.stock === 0 ? 'empty' : item.stock <= item.minStock ? 'low' : 'ok';
    return { id: item.id, name: item.name, stock: item.stock, stockText: fmtInt(item.stock), minStock: item.minStock, sold14, sold14Text: fmtInt(sold14), stockValue: item.stock * item.costPrice, stockValueText: fmtRupiah(item.stock * item.costPrice), status };
  }).filter((item) => filter === 'all' || item.status !== 'ok').sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name, 'id-ID') : a.status === 'empty' ? -1 : b.status === 'empty' ? 1 : a.status === 'low' ? -1 : 1)).slice(0, limit);
  return success(TOOL, { empty: items.length === 0, items }, items.length === 0 ? ['Tidak ada produk aktif yang sesuai.'] : []);
}

import { eq } from 'drizzle-orm';
import { estimateDaysCover } from '../../../../analytics/inventory';
import { fmtDays, fmtInt, fmtRupiah } from '../../../../shared/format';
import { makeTime } from '../../../../shared/time';
import { product } from '../../../db/schema';
import { queryFactsByProduct } from '../../facts/queries';
import type { ToolContext } from '../context';
import { failure, success, type ToolResult } from '../envelope';
import { validateArgs } from '../validate';

const TOOL = 'get_inventory';
const DAYS = 14;
const URGENT_DAYS = 7;

const filters = ['all', 'low', 'out', 'urgent', 'dead'] as const;
export type InventoryFilter = (typeof filters)[number];

export interface InventoryProduct {
  id: string;
  name: string;
  stock: number;
  costPrice: number;
  minStock: number;
  isActive: boolean;
}

export interface InventoryItem {
  id: string;
  name: string;
  stock: number;
  stockText: string;
  minStock: number;
  sold14: number;
  sold14Text: string;
  stockValue: number;
  stockValueText: string;
  status: 'out' | 'low' | 'ok';
  statusText: 'habis' | 'menipis' | 'aman';
  daysCover: number | null;
  daysCoverText: string;
  urgent: boolean;
}

export interface InventoryData {
  empty: boolean;
  filter: InventoryFilter;
  summary: {
    activeCount: number;
    activeCountText: string;
    outCount: number;
    outCountText: string;
    lowCount: number;
    lowCountText: string;
    deadCount: number;
    deadCountText: string;
    urgentCount: number;
    urgentCountText: string;
    shown: number;
    shownText: string;
    total: number;
    totalText: string;
    truncated: boolean;
    windowDays: number;
    windowDaysText: string;
    stockValue: number;
    stockValueText: string;
    inactive: { count: number; countText: string; stockValue: number; stockValueText: string };
    lines: string[];
  };
  items: InventoryItem[];
}

export function buildInventoryData(
  products: InventoryProduct[],
  soldByProductId: Map<string, number>,
  filter: InventoryFilter,
  limit: number
): InventoryData {
  const active = products.filter((item) => item.isActive);
  // out       = stock ≤ 0
  // low       = 0 < stock ≤ minStock
  // dead      = stock > 0 dan sold14 = 0
  // daysCover = estimateDaysCover(stock, sold14, 14)   (null bila Infinity)
  // urgent    = stock > 0, sold14 > 0, daysCover ≤ 7
  const items: (InventoryItem & { dead: boolean })[] = active.map((item) => {
    const sold14 = soldByProductId.get(item.id) ?? 0;
    const status: InventoryItem['status'] = item.stock <= 0 ? 'out' : item.stock <= item.minStock ? 'low' : 'ok';
    const cover = estimateDaysCover(item.stock, sold14, DAYS);
    const daysCover = Number.isFinite(cover) ? cover : null;
    const urgent = item.stock > 0 && sold14 > 0 && daysCover !== null && daysCover <= URGENT_DAYS;
    return {
      id: item.id,
      name: item.name,
      stock: item.stock,
      stockText: fmtInt(item.stock),
      minStock: item.minStock,
      sold14,
      sold14Text: fmtInt(sold14),
      stockValue: item.stock * item.costPrice,
      stockValueText: fmtRupiah(item.stock * item.costPrice),
      status,
      statusText: status === 'out' ? 'habis' : status === 'low' ? 'menipis' : 'aman',
      daysCover,
      daysCoverText: status === 'out' ? 'habis' : daysCover === null ? 'tidak ada penjualan 14 hari' : `±${fmtDays(daysCover)} hari`,
      urgent,
      dead: item.stock > 0 && sold14 === 0
    };
  });
  const outCount = items.filter((item) => item.status === 'out').length;
  const lowCount = items.filter((item) => item.status === 'low').length;
  const deadCount = items.filter((item) => item.dead).length;
  const urgentCount = items.filter((item) => item.urgent).length;
  const stockValue = active.reduce((sum, item) => sum + item.stock * item.costPrice, 0);
  const inactive = products.filter((item) => !item.isActive);
  const inactiveValue = inactive.reduce((sum, item) => sum + item.stock * item.costPrice, 0);
  const groupRank = (item: InventoryItem) => (item.status === 'out' ? 0 : item.status === 'low' ? 1 : 2);
  const byCover = (a: InventoryItem, b: InventoryItem) =>
    a.daysCover === b.daysCover ? a.name.localeCompare(b.name, 'id-ID') : a.daysCover === null ? 1 : b.daysCover === null ? -1 : a.daysCover - b.daysCover;
  const matched =
    filter === 'all' ? [...items].sort((a, b) => groupRank(a) - groupRank(b) || byCover(a, b))
    : filter === 'low' ? items.filter((item) => item.status === 'low').sort(byCover)
    : filter === 'out' ? items.filter((item) => item.status === 'out').sort(byCover)
    : filter === 'urgent' ? items.filter((item) => item.urgent).sort(byCover)
    : items.filter((item) => item.dead).sort(byCover);
  const shown: InventoryItem[] = matched
    .slice(0, limit)
    .map((item) => ({ id: item.id, name: item.name, stock: item.stock, stockText: item.stockText, minStock: item.minStock, sold14: item.sold14, sold14Text: item.sold14Text, stockValue: item.stockValue, stockValueText: item.stockValueText, status: item.status, statusText: item.statusText, daysCover: item.daysCover, daysCoverText: item.daysCoverText, urgent: item.urgent }));
  const truncated = matched.length > shown.length;
  const lines = [
    `${active.length} produk aktif: ${outCount} habis, ${lowCount} menipis, ${urgentCount} diperkirakan habis dalam 7 hari.`,
    ...(inactive.length > 0
      ? [`Produk nonaktif: ${inactive.length} produk, nilai stok ${fmtRupiah(inactiveValue)} (tidak ikut peringatan stok).`]
      : [])
  ];
  return {
    empty: shown.length === 0,
    filter,
    summary: {
      activeCount: active.length,
      activeCountText: fmtInt(active.length),
      outCount,
      outCountText: fmtInt(outCount),
      lowCount,
      lowCountText: fmtInt(lowCount),
      deadCount,
      deadCountText: fmtInt(deadCount),
      urgentCount,
      urgentCountText: fmtInt(urgentCount),
      shown: shown.length,
      shownText: fmtInt(shown.length),
      total: matched.length,
      totalText: fmtInt(matched.length),
      truncated,
      windowDays: DAYS,
      windowDaysText: fmtInt(DAYS),
      stockValue,
      stockValueText: fmtRupiah(stockValue),
      inactive: { count: inactive.length, countText: fmtInt(inactive.length), stockValue: inactiveValue, stockValueText: fmtRupiah(inactiveValue) },
      lines
    },
    items: shown
  };
}

export async function getInventory(ctx: ToolContext, input: unknown): Promise<ToolResult<InventoryData>> {
  const checked = validateArgs(input, { filter: { type: 'string', enum: filters }, limit: { type: 'integer', min: 1, max: 10 } });
  if (!checked.ok) return failure(TOOL, 'INVALID_ARGS', checked.message);
  const T = makeTime(ctx.tz);
  const since = T.startOfDay(T.addDays(ctx.now, -(DAYS - 1)));
  const [products, sales] = await Promise.all([
    ctx.db
      .select({ id: product.id, name: product.name, stock: product.stock, minStock: product.minStock, costPrice: product.costPrice, isActive: product.isActive })
      .from(product)
      .where(eq(product.businessId, ctx.businessId)),
    queryFactsByProduct(ctx.db, ctx.businessId, { from: since, to: ctx.now })
  ]);
  const filter = (checked.value.filter ?? 'all') as InventoryFilter;
  const limit = (checked.value.limit ?? 10) as number;
  const sold = new Map([...sales].map(([id, row]) => [id, row.qty] as const));
  const data = buildInventoryData(products, sold, filter, limit);
  const notes = [
    ...(data.summary.truncated ? [`Daftar dipotong: tampil ${data.summary.shown} dari ${data.summary.total}.`] : []),
    ...(data.summary.inactive.count > 0 ? ['Produk nonaktif tidak ikut peringatan stok.'] : [])
  ];
  return success(TOOL, data, data.empty ? ['Tidak ada produk aktif yang sesuai.'] : notes);
}

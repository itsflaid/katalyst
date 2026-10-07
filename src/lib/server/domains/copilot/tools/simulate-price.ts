import { and, eq } from 'drizzle-orm';
import { simulate } from '../../../../simulation';
import { ZERO_FACTS } from '../../../../analytics/facts';
import { fmtDelta, fmtInt, fmtPercent, fmtPoints, fmtRupiah } from '../../../../shared/format';
import { resolveNamedPeriod, type NamedPeriodKey } from '../../../../shared/period';
import { product } from '../../../db/schema';
import { queryFactsByProduct } from '../../facts/queries';
import type { ToolContext } from '../context';
import { failure, success, type ToolResult } from '../envelope';
import { resolveProduct } from '../product-resolver';
import { validateArgs } from '../validate';

const TOOL = 'simulate_price';
const periods = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_30d', 'custom'] as const;

export interface SimulatePriceData {
  product: { id: string; name: string };
  window: { key: NamedPeriodKey; label: string };
  current: { profit: number; profitText: string; margin: number; marginText: string; qty: number; qtyText: string };
  simulated: { profit: number; profitText: string; margin: number; marginText: string; qty: number; qtyText: string };
  impact: { profit: number | null; profitText: string; marginPoints: number; marginPointsText: string };
  breakEvenQty: number | null;
  breakEvenQtyText: string | null;
  maxDiscountPct: number | null;
  maxDiscountPctText: string | null;
  flags: string[];
  simulatorLink: string;
}

export async function simulatePrice(ctx: ToolContext, input: unknown): Promise<ToolResult<SimulatePriceData>> {
  const checked = validateArgs(input, {
    product: { type: 'string', required: true }, period: { type: 'string', enum: periods }, from: { type: 'string' }, to: { type: 'string' },
    priceDelta: { type: 'integer' }, price: { type: 'integer', min: 0 }, discountPct: { type: 'integer', min: 0, max: 100 }, volumePct: { type: 'integer', min: -100, max: 1000 }
  });
  if (!checked.ok) return failure(TOOL, 'INVALID_ARGS', checked.message);
  const period = (checked.value.period ?? 'last_30d') as NamedPeriodKey;
  const from = checked.value.from as string | undefined;
  const to = checked.value.to as string | undefined;
  if (period === 'custom' && (!from || !to)) return failure(TOOL, 'INVALID_ARGS', 'Periode custom memerlukan from dan to.');
  const window = resolveNamedPeriod(period, ctx.tz, ctx.now, from && to ? { from, to } : undefined);
  if (!window.from || !window.to) return failure(TOOL, 'INVALID_ARGS', 'Periode tidak valid.');
  const products = await ctx.db.select({ id: product.id, name: product.name, sellingPrice: product.sellingPrice, costPrice: product.costPrice }).from(product).where(and(eq(product.businessId, ctx.businessId), eq(product.isActive, true)));
  const resolved = resolveProduct(checked.value.product as string, products);
  if (resolved.kind === 'not_found') {
    const names = resolved.candidates.map((c) => c.name).join(', ');
    return failure(TOOL, 'PRODUCT_NOT_FOUND', `Produk '${resolved.query}' tidak ditemukan.${names ? ` Yang mirip: ${names}.` : ''}`, resolved.candidates);
  }
  if (resolved.kind === 'ambiguous') return failure(TOOL, 'AMBIGUOUS_PRODUCT', `Ada ${resolved.candidates.length} produk yang cocok dengan '${resolved.query}'.`, resolved.candidates);
  const selected = products.find((item) => item.id === resolved.product.id)!;
  const facts = await queryFactsByProduct(ctx.db, ctx.businessId, { from: window.from, to: window.to }, { productIds: [selected.id] });
  const baseline = facts.get(selected.id) ?? ZERO_FACTS;
  const price = checked.value.price as number | undefined;
  const priceDelta = checked.value.priceDelta as number | undefined;
  if (price !== undefined && priceDelta !== undefined) return failure(TOOL, 'INVALID_ARGS', 'Pakai price atau priceDelta, bukan keduanya.');
  const targetPrice = price ?? (priceDelta === undefined ? selected.sellingPrice : selected.sellingPrice + priceDelta);
  if (targetPrice < 0) return failure(TOOL, 'INVALID_ARGS', 'Harga hasil simulasi tidak boleh negatif.');
  try {
    const result = simulate({ baseline, product: selected, levers: { price: targetPrice, ...(checked.value.discountPct === undefined ? {} : { discount: { kind: 'percent' as const, pct: checked.value.discountPct as number } }), ...(checked.value.volumePct === undefined ? {} : { volume: { kind: 'pct' as const, pct: checked.value.volumePct as number } }) } });
    return success(TOOL, {
      product: resolved.product, window: { key: period, label: window.label },
      current: { profit: result.statusQuo.profit, profitText: fmtRupiah(result.statusQuo.profit), margin: result.statusQuo.margin, marginText: fmtPercent(result.statusQuo.margin), qty: result.statusQuo.qty, qtyText: fmtInt(result.statusQuo.qty) },
      simulated: { profit: result.simulated.profit, profitText: fmtRupiah(result.simulated.profit), margin: result.simulated.margin, marginText: fmtPercent(result.simulated.margin), qty: result.simulated.qty, qtyText: fmtInt(result.simulated.qty) },
      impact: { profit: result.impact.vsStatusQuo.profit, profitText: fmtDelta(result.impact.vsStatusQuo.profit), marginPoints: result.impact.vsStatusQuo.marginPoints, marginPointsText: fmtPoints(result.impact.vsStatusQuo.marginPoints) },
      breakEvenQty: result.breakEvenQty, breakEvenQtyText: result.breakEvenQty === null ? null : fmtInt(result.breakEvenQty), maxDiscountPct: result.maxDiscountPct, maxDiscountPctText: result.maxDiscountPct === null ? null : fmtPercent(result.maxDiscountPct / 100), flags: result.flags, simulatorLink: `/simulator?productId=${encodeURIComponent(selected.id)}`
    });
  } catch (error) {
    return failure(TOOL, 'INVALID_ARGS', error instanceof Error ? error.message : 'Skenario tidak valid.');
  }
}

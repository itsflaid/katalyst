import { db } from '$lib/server/db';
import { product, stockMovement, user } from '$lib/server/db/schema';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { parseDayWita, endOfDayWita, dayKeyWita } from '$lib/shared/time';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 30;
const REASONS = ['SALE', 'VOID_RESTORE', 'RESTOCK', 'ADJUST'] as const;

export const load: PageServerLoad = async ({ locals, url }) => {
  const businessId = locals.user!.businessId as string;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const reasonParam = url.searchParams.get('reason') ?? '';
  const reason = (REASONS as readonly string[]).includes(reasonParam) ? reasonParam : null;
  const productParam = url.searchParams.get('product') ?? '';
  const fromParsed = parseDayWita(url.searchParams.get('from') ?? '');
  const toParsed = parseDayWita(url.searchParams.get('to') ?? '');
  const from = fromParsed;
  const to = toParsed ? endOfDayWita(toParsed) : null;

  const conditions = [eq(stockMovement.businessId, businessId)];
  if (reason) conditions.push(eq(stockMovement.reason, reason as (typeof REASONS)[number]));
  if (productParam) conditions.push(eq(stockMovement.productId, productParam));
  if (from) conditions.push(gte(stockMovement.createdAt, from));
  if (to) conditions.push(lte(stockMovement.createdAt, to));

  const [products, rows, sums] = await Promise.all([
    db
      .select({ id: product.id, name: product.name })
      .from(product)
      .where(eq(product.businessId, businessId)),
    db
      .select({
        id: stockMovement.id,
        qtyChange: stockMovement.qtyChange,
        reason: stockMovement.reason,
        note: stockMovement.note,
        refTxId: stockMovement.refTxId,
        createdAt: stockMovement.createdAt,
        productId: product.id,
        productName: product.name,
        createdByName: user.name
      })
      .from(stockMovement)
      .innerJoin(product, eq(product.id, stockMovement.productId))
      .leftJoin(user, eq(user.id, stockMovement.createdBy))
      .where(and(...conditions))
      .orderBy(desc(stockMovement.createdAt))
      .limit(PAGE_SIZE + 1)
      .offset(offset),
    // Ringkasan rentang terfilter (filter sama, tanpa pagination).
    db
      .select({
        masuk: sql<string>`coalesce(sum(${stockMovement.qtyChange}) filter (where ${stockMovement.reason} in ('RESTOCK', 'VOID_RESTORE')), 0)::text`,
        terjual: sql<string>`coalesce(sum(-${stockMovement.qtyChange}) filter (where ${stockMovement.reason} = 'SALE'), 0)::text`,
        koreksi: sql<string>`coalesce(sum(${stockMovement.qtyChange}) filter (where ${stockMovement.reason} = 'ADJUST'), 0)::text`
      })
      .from(stockMovement)
      .where(and(...conditions))
  ]);

  const hasMore = rows.length > PAGE_SIZE;
  const movements = rows.slice(0, PAGE_SIZE);
  const [sum] = sums;

  const qs = (extra: Record<string, string | number>) => {
    const params = new URLSearchParams();
    if (reason) params.set('reason', reason);
    if (productParam) params.set('product', productParam);
    if (fromParsed) params.set('from', dayKeyWita(fromParsed));
    if (toParsed) params.set('to', dayKeyWita(toParsed));
    for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
    const s = params.toString();
    return `/products/stok${s ? `?${s}` : ''}`;
  };

  return {
    movements,
    summary: { masuk: Number(sum?.masuk ?? 0), terjual: Number(sum?.terjual ?? 0), koreksi: Number(sum?.koreksi ?? 0) },
    products,
    page,
    hasMore,
    moreHref: qs({ page: page + 1 }),
    reason,
    productFilter: productParam,
    fromISO: fromParsed ? dayKeyWita(fromParsed) : '',
    toISO: toParsed ? dayKeyWita(toParsed) : ''
  };
};

import { db } from '$lib/server/db';
import { product, stockMovement, user } from '$lib/server/db/schema';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { metricsOf, ZERO_FACTS, type ProductSummary } from '$lib/analytics';
import { queryFactsByProduct } from '$lib/server/domains/facts/queries';

export async function listProducts(businessId: string) {
  // Urutan tetap: tanpa ORDER BY, baris yang di-UPDATE pindah posisi dan daftar tampak tertukar.
  return db.select().from(product).where(eq(product.businessId, businessId)).orderBy(asc(product.createdAt), asc(product.id));
}

export async function getOwnedProduct(id: string, businessId: string) {
  const [row] = await db
    .select({
      id: product.id,
      name: product.name,
      costPrice: product.costPrice,
      sellingPrice: product.sellingPrice,
      minStock: product.minStock,
      isActive: product.isActive,
      stock: product.stock
    })
    .from(product)
    .where(and(eq(product.id, id), eq(product.businessId, businessId)));
  return row ?? null;
}

export interface ProductDetail {
  product: typeof product.$inferSelect;
  performance: ProductSummary;
  movements: {
    qtyChange: number;
    reason: string;
    note: string | null;
    createdAt: Date;
    createdByName: string | null;
  }[];
}

export async function getProductDetail(businessId: string, productId: string): Promise<ProductDetail | null> {
  const [p] = await db
    .select()
    .from(product)
    .where(and(eq(product.id, productId), eq(product.businessId, businessId)));

  if (!p) return null;

  // Performa all-time dari lapisan Facts.
  // Bentuk `performance` (ProductSummary) tetap.
  const factsMap = await queryFactsByProduct(db, businessId, { from: null, to: null }, { productIds: [p.id] });
  const m = metricsOf(factsMap.get(p.id) ?? ZERO_FACTS);
  const performance = {
    productId: p.id,
    name: p.name,
    quantitySold: m.qty,
    revenue: m.revenue,
    cost: m.cost,
    profit: m.profit,
    margin: m.margin
  };

  const movements = await db
    .select({
      qtyChange: stockMovement.qtyChange,
      reason: stockMovement.reason,
      note: stockMovement.note,
      createdAt: stockMovement.createdAt,
      createdByName: user.name
    })
    .from(stockMovement)
    .leftJoin(user, eq(user.id, stockMovement.createdBy))
    .where(and(eq(stockMovement.businessId, businessId), eq(stockMovement.productId, p.id)))
    .orderBy(desc(stockMovement.createdAt))
    .limit(20);

  return { product: p, performance, movements };
}

export const STOCK_REASONS = ['SALE', 'VOID_RESTORE', 'RESTOCK', 'ADJUST'] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

const STOCK_PAGE_SIZE = 30;

export interface StockLedgerFilter {
  reason: StockReason | null;
  productId: string;
  from: Date | null;
  to: Date | null;
  page: number;
}

export async function getStockLedger(businessId: string, filter: StockLedgerFilter) {
  const offset = (filter.page - 1) * STOCK_PAGE_SIZE;

  const conditions = [eq(stockMovement.businessId, businessId)];
  if (filter.reason) conditions.push(eq(stockMovement.reason, filter.reason));
  if (filter.productId) conditions.push(eq(stockMovement.productId, filter.productId));
  if (filter.from) conditions.push(gte(stockMovement.createdAt, filter.from));
  if (filter.to) conditions.push(lte(stockMovement.createdAt, filter.to));

  const [products, rows, sums] = await Promise.all([
    db.select({ id: product.id, name: product.name }).from(product).where(eq(product.businessId, businessId)),
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
      .limit(STOCK_PAGE_SIZE + 1)
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

  const hasMore = rows.length > STOCK_PAGE_SIZE;
  const movements = rows.slice(0, STOCK_PAGE_SIZE);
  const [sum] = sums;

  return {
    products,
    movements,
    summary: { masuk: Number(sum?.masuk ?? 0), terjual: Number(sum?.terjual ?? 0), koreksi: Number(sum?.koreksi ?? 0) },
    hasMore
  };
}

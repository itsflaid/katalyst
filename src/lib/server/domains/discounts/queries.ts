import { db } from '$lib/server/db';
import { discount, product } from '$lib/server/db/schema';
import { and, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, or } from 'drizzle-orm';

// Daftar semua diskon satu bisnis + nama produk (untuk cakupan PRODUCT).
// Status dihitung di load via getDiscountStatus (tidak disimpan di DB).
export async function listDiscounts(businessId: string) {
  const rows = await db
    .select({
      id: discount.id,
      name: discount.name,
      scope: discount.scope,
      percent: discount.percent,
      productId: discount.productId,
      productName: product.name,
      isActive: discount.isActive,
      startsAt: discount.startsAt,
      endsAt: discount.endsAt,
      quota: discount.quota,
      quotaUsed: discount.quotaUsed,
      createdAt: discount.createdAt
    })
    .from(discount)
    .leftJoin(product, eq(product.id, discount.productId))
    .where(eq(discount.businessId, businessId))
    .orderBy(desc(discount.createdAt));
  return rows;
}

// Diskon PRODUCT yang sedang ACTIVE untuk daftar produk (dipakai kasir).
// Filter status di sini setara getDiscountStatus = ACTIVE (isActive + window + kuota).
export async function getActiveProductDiscounts(businessId: string, productIds: string[], now: Date) {
  if (productIds.length === 0) return [];
  const rows = await db
    .select({
      id: discount.id,
      name: discount.name,
      scope: discount.scope,
      percent: discount.percent,
      productId: discount.productId,
      isActive: discount.isActive,
      startsAt: discount.startsAt,
      endsAt: discount.endsAt,
      quota: discount.quota,
      quotaUsed: discount.quotaUsed,
      createdAt: discount.createdAt
    })
    .from(discount)
    .where(
      and(
        eq(discount.businessId, businessId),
        eq(discount.scope, 'PRODUCT'),
        eq(discount.isActive, true),
        inArray(discount.productId, productIds),
        lte(discount.startsAt, now),
        or(isNull(discount.endsAt), gte(discount.endsAt, now)),
        or(isNull(discount.quota), gte(discount.quota, discount.quotaUsed))
      )
    );
  return rows;
}

// Satu diskon GLOBAL milik bisnis (status dicek pemanggil via getDiscountStatus).
export async function getGlobalDiscount(businessId: string, id: string) {
  const [row] = await db
    .select({
      id: discount.id,
      name: discount.name,
      scope: discount.scope,
      percent: discount.percent,
      productId: discount.productId,
      isActive: discount.isActive,
      startsAt: discount.startsAt,
      endsAt: discount.endsAt,
      quota: discount.quota,
      quotaUsed: discount.quotaUsed,
      createdAt: discount.createdAt
    })
    .from(discount)
    .where(and(eq(discount.id, id), eq(discount.businessId, businessId), eq(discount.scope, 'GLOBAL')));
  return row ?? null;
}

// Cari diskon PRODUCT aktif yang rentangnya bertabrakan (untuk validasi overlap).
// endsAt null berarti tak hingga; excludeId mengabaikan diri sendiri (saat update/toggle).
export async function findOverlap(
  businessId: string,
  productId: string,
  startsAt: Date,
  endsAt: Date | null,
  excludeId?: string
) {
  const conds = [
    eq(discount.businessId, businessId),
    eq(discount.scope, 'PRODUCT'),
    eq(discount.productId, productId),
    eq(discount.isActive, true),
    // Rentang setengah terbuka '[)': yang berakhir tepat saat mulai tidak bertabrakan.
    or(isNull(discount.endsAt), gt(discount.endsAt, startsAt))
  ];
  if (endsAt !== null) conds.push(lt(discount.startsAt, endsAt));
  if (excludeId) conds.push(ne(discount.id, excludeId));
  const rows = await db
    .select({ id: discount.id, name: discount.name })
    .from(discount)
    .where(and(...conds));
  return rows;
}

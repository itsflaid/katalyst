import { db } from '$lib/server/db';
import { product } from '$lib/server/db/schema';
import { and, asc, eq } from 'drizzle-orm';

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

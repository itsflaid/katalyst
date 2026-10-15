import { db } from '$lib/server/db';
import { product } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

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

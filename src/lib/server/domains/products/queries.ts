import { db } from '$lib/server/db';
import { product } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';

// STAFF boleh buka /products (lihat stok & harga), tapi semua perubahan
// data produk OWNER-only. Dicek di server, menyembunyikan tombol di UI
// saja tidak cukup karena form action bisa dipanggil langsung.
export function denyUnlessOwner(locals: App.Locals, forKey: string, message: string) {
  if (locals.user?.role !== 'OWNER') return fail(403, { for: forKey, message });
  return null;
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

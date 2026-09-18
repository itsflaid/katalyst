import { db } from '$lib/server/db';
import { product, transaction, transactionItem } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { getProductPerformance, type TransactionItemLike } from '$lib/analytics';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const businessId = locals.user!.businessId as string;

  const [p] = await db
    .select()
    .from(product)
    .where(and(eq(product.id, params.id), eq(product.businessId, businessId)));

  if (!p) throw error(404, 'Produk tidak ditemukan');

  const txItems = await db
    .select({
      productId: transactionItem.productId,
      quantity: transactionItem.quantity,
      priceAtSale: transactionItem.priceAtSale,
      costAtSale: transactionItem.costAtSale
    })
    .from(transactionItem)
    .innerJoin(transaction, eq(transaction.id, transactionItem.transactionId))
    .where(and(eq(transaction.businessId, businessId), eq(transactionItem.productId, p.id)));

  const items: TransactionItemLike[] = txItems;
  const performance = getProductPerformance(p.id, p.name, items);

  return { product: p, performance };
};

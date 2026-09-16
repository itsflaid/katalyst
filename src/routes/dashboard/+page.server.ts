import { db } from '$lib/server/db';
import { product, transaction, transactionItem } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import {
  getBusinessSummary,
  summarizeByProduct,
  getTopProducts,
  getBusinessInsights,
  type TransactionItemLike
} from '$lib/analytics';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const businessId = locals.user!.businessId as string;

  const products = await db.select().from(product).where(eq(product.businessId, businessId));
  const productNames = Object.fromEntries(products.map((p) => [p.id, p.name]));

  const txItems = await db
    .select({
      productId: transactionItem.productId,
      quantity: transactionItem.quantity,
      priceAtSale: transactionItem.priceAtSale,
      costAtSale: transactionItem.costAtSale
    })
    .from(transactionItem)
    .innerJoin(transaction, eq(transaction.id, transactionItem.transactionId))
    .where(eq(transaction.businessId, businessId));

  const items: TransactionItemLike[] = txItems;

  const summary = getBusinessSummary(items);
  const perProduct = summarizeByProduct(items, productNames);
  const topByRevenue = getTopProducts(perProduct, 'revenue', 5);
  const insights = getBusinessInsights(perProduct);

  return { summary, topByRevenue, insights };
};

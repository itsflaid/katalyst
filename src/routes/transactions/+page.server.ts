import { db } from '$lib/server/db';
import { transaction, transactionItem, product, user } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const businessId = locals.user!.businessId as string;

  const rows = await db
    .select({
      id: transaction.id,
      createdAt: transaction.createdAt,
      servedBy: user.name,
      productName: product.name,
      quantity: transactionItem.quantity,
      priceAtSale: transactionItem.priceAtSale
    })
    .from(transaction)
    .innerJoin(transactionItem, eq(transactionItem.transactionId, transaction.id))
    .innerJoin(product, eq(product.id, transactionItem.productId))
    .innerJoin(user, eq(user.id, transaction.userId))
    .where(eq(transaction.businessId, businessId))
    .orderBy(desc(transaction.createdAt))
    .limit(100);

  return { transactions: rows };
};

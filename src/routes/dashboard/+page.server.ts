import { db } from '$lib/server/db';
import { product, transaction, transactionItem, user } from '$lib/server/db/schema';
import { eq, count, desc } from 'drizzle-orm';
import {
  getBusinessSummary,
  summarizeByProduct,
  getTopProducts,
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

  // Jumlah transaksi real (bukan jumlah baris item) — dipakai gantiin
  // card "Cost" di KPI row biar gak overlap sama chart revenue-per-produk,
  // dan lebih deket ke "Transaction Volume" di referensi desain.
  const [{ value: transactionCount }] = await db
    .select({ value: count() })
    .from(transaction)
    .where(eq(transaction.businessId, businessId));

  // 10 item transaksi terbaru untuk card dashboard — pola join sama
  // kayak halaman /transactions, cuma limit 10.
  const recentTransactions = await db
    .select({
      productName: product.name,
      quantity: transactionItem.quantity,
      priceAtSale: transactionItem.priceAtSale,
      createdAt: transaction.createdAt,
      servedBy: user.name
    })
    .from(transaction)
    .innerJoin(transactionItem, eq(transactionItem.transactionId, transaction.id))
    .innerJoin(product, eq(product.id, transactionItem.productId))
    .innerJoin(user, eq(user.id, transaction.userId))
    .where(eq(transaction.businessId, businessId))
    .orderBy(desc(transaction.createdAt))
    .limit(10);

  return { summary, topByRevenue, recentTransactions, transactionCount };
};
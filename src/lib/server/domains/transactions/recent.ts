import { db } from '$lib/server/db';
import { product, transaction, transactionItem, user } from '$lib/server/db/schema';
import { desc, eq } from 'drizzle-orm';

// 10 baris item terbaru (transaksi multi-item muncul sebagai beberapa baris);
// leftJoin user agar struk staff terhapus tetap tampil via cashier_name.
// discountAmount ikut agar total bersih (net).
export async function queryRecentItems(businessId: string, limit = 10) {
  return db
    .select({
      productName: product.name,
      quantity: transactionItem.quantity,
      priceAtSale: transactionItem.priceAtSale,
      discountAmount: transactionItem.discountAmount,
      createdAt: transaction.createdAt,
      cashierName: transaction.cashierName,
      userName: user.name
    })
    .from(transaction)
    .innerJoin(transactionItem, eq(transactionItem.transactionId, transaction.id))
    .innerJoin(product, eq(product.id, transactionItem.productId))
    .leftJoin(user, eq(user.id, transaction.userId))
    .where(eq(transaction.businessId, businessId))
    .orderBy(desc(transaction.createdAt))
    .limit(limit);
}

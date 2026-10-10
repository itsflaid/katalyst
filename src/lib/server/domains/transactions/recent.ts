import { db } from '$lib/server/db';
import { transaction, transactionItem, user } from '$lib/server/db/schema';
import { receiptTotals } from '$lib/analytics';
import { desc, eq, inArray } from 'drizzle-orm';

export interface RecentReceipt {
  txId: string;
  createdAt: Date;
  cashier: string;
  kinds: number;
  qty: number;
  total: number;
}

// 10 struk terbaru (1 baris per struk); leftJoin user agar struk staff
// terhapus tetap tampil via cashier_name. Total bersih dihitung engine.
export async function queryRecentReceipts(businessId: string, limit = 10): Promise<RecentReceipt[]> {
  const headers = await db
    .select({
      id: transaction.id,
      createdAt: transaction.createdAt,
      cashierName: transaction.cashierName,
      userName: user.name
    })
    .from(transaction)
    .leftJoin(user, eq(user.id, transaction.userId))
    .where(eq(transaction.businessId, businessId))
    .orderBy(desc(transaction.createdAt))
    .limit(limit);
  if (headers.length === 0) return [];
  const itemRows = await db
    .select({
      transactionId: transactionItem.transactionId,
      quantity: transactionItem.quantity,
      priceAtSale: transactionItem.priceAtSale,
      discountAmount: transactionItem.discountAmount
    })
    .from(transactionItem)
    .where(
      inArray(
        transactionItem.transactionId,
        headers.map((h) => h.id)
      )
    );
  const byTx = new Map<string, typeof itemRows>();
  for (const row of itemRows) {
    const list = byTx.get(row.transactionId) ?? [];
    list.push(row);
    byTx.set(row.transactionId, list);
  }
  return headers.map((h) => {
    const items = byTx.get(h.id) ?? [];
    return {
      txId: h.id,
      createdAt: h.createdAt,
      cashier: h.cashierName ?? h.userName ?? '-',
      kinds: items.length,
      qty: items.reduce((sum, i) => sum + i.quantity, 0),
      total: receiptTotals(items).total
    };
  });
}

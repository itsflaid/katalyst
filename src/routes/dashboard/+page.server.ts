import { db } from '$lib/server/db';
import { product, transaction, transactionItem, user } from '$lib/server/db/schema';
import { eq, count, desc, sql } from 'drizzle-orm';
import {
  calculateMargin,
  getTopProducts,
  type ProductSummary
} from '$lib/analytics';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const businessId = locals.user!.businessId as string;

  // 4 query independen — jalan PARALEL dalam satu round-trip, bukan serial.
  // Agregasi KPI dihitung di SQL (GROUP BY + SUM) sehingga yang ditransfer
  // cuma 1 baris per produk, bukan 1 baris per item transaksi (yang tumbuh
  // tanpa batas: 12rb+ baris saat ini). Hasil angkanya identik dengan
  // agregasi JS sebelumnya (penjumlahan integer bersifat asosiatif), cuma
  // lokasi hitungnya pindah ke database.
  const [products, grouped, countRows, recentTransactions] = await Promise.all([
    db
      .select({ id: product.id, name: product.name })
      .from(product)
      .where(eq(product.businessId, businessId)),

    db
      .select({
        productId: transactionItem.productId,
        // SUM numeric PG balik sebagai string via driver — di-Number() di bawah.
        // quantity*price di-cast ke bigint dulu biar baris ekstrem gak
        // overflow int4 di sisi database.
        quantitySold: sql<string>`sum(${transactionItem.quantity})::text`,
        revenue: sql<string>`sum(${transactionItem.quantity}::bigint * ${transactionItem.priceAtSale})::text`,
        cost: sql<string>`sum(${transactionItem.quantity}::bigint * ${transactionItem.costAtSale})::text`
      })
      .from(transactionItem)
      .innerJoin(transaction, eq(transaction.id, transactionItem.transactionId))
      .where(eq(transaction.businessId, businessId))
      .groupBy(transactionItem.productId),

    // Jumlah transaksi real (bukan jumlah baris item) — dipakai gantiin
    // card "Cost" di KPI row biar gak overlap sama chart revenue-per-produk,
    // dan lebih deket ke "Transaction Volume" di referensi desain.
    db
      .select({ value: count() })
      .from(transaction)
      .where(eq(transaction.businessId, businessId)),

    // 10 item transaksi terbaru untuk card dashboard — pola join sama
    // kayak halaman /transactions, cuma limit 10.
    db
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
      .limit(10)
  ]);

  const productNames = Object.fromEntries(products.map((p) => [p.id, p.name]));

  // Bentuk ProductSummary persis kayak summarizeByProduct lama (termasuk
  // fallback nama & aturan margin revenue-0), cuma sumber angkanya dari SQL.
  const perProduct: ProductSummary[] = grouped.map((g) => {
    const quantitySold = Number(g.quantitySold);
    const revenue = Number(g.revenue);
    const cost = Number(g.cost);
    const profit = revenue - cost;
    return {
      productId: g.productId,
      name: productNames[g.productId] ?? 'Produk tidak dikenal',
      quantitySold,
      revenue,
      cost,
      profit,
      margin: calculateMargin(revenue, profit)
    };
  });

  // Total bisnis = jumlahkan total per produk — sama persis dengan menjumlah
  // semua item dulu baru ditotal (asosiatif), jadi KPI tidak berubah.
  const revenue = perProduct.reduce((s, p) => s + p.revenue, 0);
  const cost = perProduct.reduce((s, p) => s + p.cost, 0);
  const profit = revenue - cost;
  const summary = { revenue, cost, profit, margin: calculateMargin(revenue, profit) };

  const topByRevenue = getTopProducts(perProduct, 'revenue', 5);

  const [{ value: transactionCount }] = countRows;

  return { summary, topByRevenue, recentTransactions, transactionCount };
};
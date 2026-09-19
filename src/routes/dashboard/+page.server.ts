import { db } from '$lib/server/db';
import { product, transaction, transactionItem, user } from '$lib/server/db/schema';
import { eq, and, asc, count, desc, sql, gte } from 'drizzle-orm';
import {
  calculateMargin,
  getBusinessInsights,
  getTopProducts,
  type ProductSummary
} from '$lib/analytics';
import { startOfDayWita, addDaysWita, dayKeyWita, toWita } from '$lib/time';
import { witaDate } from '$lib/server/sql';
import { pickMoneyUnit, scaleMoney } from '$lib/format';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const businessId = locals.user!.businessId as string;

  // 4 query independen — jalan PARALEL dalam satu round-trip, bukan serial.
  // Agregasi KPI dihitung di SQL (GROUP BY + SUM) sehingga yang ditransfer
  // cuma 1 baris per produk, bukan 1 baris per item transaksi (yang tumbuh
  // tanpa batas: 12rb+ baris saat ini). Hasil angkanya identik dengan
  // agregasi JS sebelumnya (penjumlahan integer bersifat asosiatif), cuma
  // lokasi hitungnya pindah ke database.
  // Query ke-5: agregat harian 60 hari terakhir — 1 query melayani tren
  // (30 hari terakhir) + delta (30 hari ini vs 30 hari sebelumnya).
  // Semua batas hari & bucket memakai WITA (bukan UTC / lokal server).
  const sixtyDaysAgo = startOfDayWita(addDaysWita(new Date(), -59));
  // Objek ekspresi yang sama dipakai di select & groupBy (lihat sql.ts).
  const dayExpr = witaDate(transaction.createdAt);
  const [products, grouped, countRows, recentTransactions, dailyRows, restockList, restockCounts] = await Promise.all([
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

    // 10 item transaksi terbaru untuk card dashboard — leftJoin user biar
    // struk staff yang sudah dihapus tetap tampil via cashier_name.
    db
      .select({
        productName: product.name,
        quantity: transactionItem.quantity,
        priceAtSale: transactionItem.priceAtSale,
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
      .limit(10),

    db
      .select({
        day: sql<string>`(${dayExpr})::text`,
        revenue: sql<string>`sum(${transactionItem.quantity}::bigint * ${transactionItem.priceAtSale})::text`,
        cost: sql<string>`sum(${transactionItem.quantity}::bigint * ${transactionItem.costAtSale})::text`,
        txCount: sql<string>`count(distinct ${transaction.id})::text`
      })
      .from(transaction)
      .innerJoin(transactionItem, eq(transactionItem.transactionId, transaction.id))
      .where(and(eq(transaction.businessId, businessId), gte(transaction.createdAt, sixtyDaysAgo)))
      .groupBy(dayExpr),

    // Kartu "Perlu restock": produk aktif dengan stok <= ambang, 5 paling
    // kritis + hitungan habis & menipis.
    db
      .select({ id: product.id, name: product.name, stock: product.stock, minStock: product.minStock })
      .from(product)
      .where(
        and(
          eq(product.businessId, businessId),
          eq(product.isActive, true),
          sql`${product.stock} <= ${product.minStock}`
        )
      )
      .orderBy(asc(product.stock))
      .limit(5),

    db
      .select({
        habis: sql<string>`count(*) filter (where ${product.stock} <= 0)::text`,
        menipis: sql<string>`count(*) filter (where ${product.stock} > 0 and ${product.stock} <= ${product.minStock})::text`
      })
      .from(product)
      .where(eq(product.businessId, businessId))
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
  const insights = getBusinessInsights(perProduct).slice(0, 3);

  const [{ value: transactionCount }] = countRows;

  // Bangun deret harian 60 hari (isi 0 untuk hari tanpa transaksi) dari
  // hasil GROUP BY di atas. 30 hari terakhir → tren chart (dalam jt Rp
  // biar sumbu terbaca), 30 vs 30 sebelumnya → delta KPI.
  const byDay = new Map(
    dailyRows.map((r) => [
      r.day,
      { revenue: Number(r.revenue), cost: Number(r.cost), tx: Number(r.txCount) }
    ])
  );
  const days: { key: string; label: string; revenue: number; profit: number; tx: number }[] = [];
  const todayStart = startOfDayWita(new Date());
  for (let i = 59; i >= 0; i--) {
    const d = addDaysWita(todayStart, -i);
    const key = dayKeyWita(d);
    const w = toWita(d);
    const v = byDay.get(key) ?? { revenue: 0, cost: 0, tx: 0 };
    days.push({
      key,
      label: `${w.getUTCDate()}/${w.getUTCMonth() + 1}`,
      revenue: v.revenue,
      profit: v.revenue - v.cost,
      tx: v.tx
    });
  }
  const prev = days.slice(0, 30);
  const cur = days.slice(30);
  const sum = (arr: typeof days, f: (d: (typeof days)[number]) => number) =>
    arr.reduce((s, d) => s + f(d), 0);
  const curRev = sum(cur, (d) => d.revenue);
  const prevRev = sum(prev, (d) => d.revenue);
  const curProfit = sum(cur, (d) => d.profit);
  const prevProfit = sum(prev, (d) => d.profit);
  const curTx = sum(cur, (d) => d.tx);
  const prevTx = sum(prev, (d) => d.tx);
  const pct = (c: number, p: number): number | null => {
    if (p === 0) return c === 0 ? 0 : null;
    return ((c - p) / Math.abs(p)) * 100;
  };
  const curMargin = calculateMargin(curRev, curProfit);
  const prevMargin = calculateMargin(prevRev, prevProfit);
  // Unit sumbu adaptif (rb/jt) biar warung omzet ratusan ribu tidak patah-patah.
  const moneyUnit = pickMoneyUnit(Math.max(Math.abs(curRev), Math.abs(curProfit), 0));
  const trend = {
    labels: cur.map((d) => d.label),
    revenue: scaleMoney(
      cur.map((d) => d.revenue),
      moneyUnit
    ),
    profit: scaleMoney(
      cur.map((d) => d.profit),
      moneyUnit
    ),
    unitLabel: moneyUnit.label
  };
  const deltas = {
    revenue: pct(curRev, prevRev),
    profit: pct(curProfit, prevProfit),
    transactions: pct(curTx, prevTx),
    // poin margin ×100 biar se-skala dengan badge persen.
    margin: prevRev === 0 && curRev === 0 ? 0 : (curMargin - prevMargin) * 100
  };

  const [{ habis, menipis }] = restockCounts;
  const restock = {
    list: restockList,
    habis: Number(habis ?? 0),
    menipis: Number(menipis ?? 0)
  };

  return { summary, topByRevenue, recentTransactions, transactionCount, trend, deltas, insights, restock };
};
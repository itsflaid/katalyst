import { db } from '$lib/server/db';
import { product, stockMovement, transaction, transactionItem, user } from '$lib/server/db/schema';
import { and, count, eq, gte, lte, sql } from 'drizzle-orm';
import { localHour, localWeekStart } from '$lib/server/sql';
import { factColumns, toFacts } from '../facts/queries';
import { metricsOf } from '$lib/analytics';
import { makeTime, type BizTz } from '$lib/shared/time';

// Jendela inventori tetap 14 hari (tidak ikut filter rentang halaman).
export const INVENTORY_WINDOW_DAYS = 14;

// Jam tersibuk: jumlah struk per jam dinding zona bisnis.
export async function queryHourly(businessId: string, from: Date, to: Date, tz: BizTz) {
  // Objek ekspresi yang sama dipakai di select & groupBy (lihat sql.ts).
  const hourExpr = localHour(transaction.createdAt, tz);
  const rows = await db
    .select({
      hour: sql<number>`${hourExpr}`,
      tx: sql<string>`count(distinct ${transaction.id})::text`
    })
    .from(transaction)
    .where(and(eq(transaction.businessId, businessId), gte(transaction.createdAt, from), lte(transaction.createdAt, to)))
    .groupBy(hourExpr);
  return rows.map((r) => ({ hour: Number(r.hour), tx: Number(r.tx) }));
}

// Penjualan per kasir: kelompok per userId (stabil walau staff ganti nama),
// label berisi nama user terkini, fallback snapshot cashier_name.
// Revenue dari factColumns + metricsOf.
export async function queryCashiers(businessId: string, from: Date, to: Date) {
  // Literal coalesce, tanpa parameter, jadi aman dipakai ulang di groupBy.
  const keyExpr = sql<string>`coalesce(${transaction.userId}, ${transaction.cashierName}, '-')`;
  const rows = await db
    .select({
      key: keyExpr,
      userId: sql<string | null>`max(${transaction.userId})`,
      label: sql<string>`coalesce(max(${user.name}), max(${transaction.cashierName}), 'Tanpa nama')`,
      tx: sql<string>`count(distinct ${transaction.id})::text`,
      ...factColumns()
    })
    .from(transaction)
    .leftJoin(user, eq(user.id, transaction.userId))
    .innerJoin(transactionItem, eq(transactionItem.transactionId, transaction.id))
    .where(and(eq(transaction.businessId, businessId), gte(transaction.createdAt, from), lte(transaction.createdAt, to)))
    .groupBy(keyExpr);
  return rows.map((r) => {
    const revenue = metricsOf(toFacts(r)).revenue;
    const tx = Number(r.tx);
    return {
      key: r.key,
      userId: r.userId,
      label: r.label,
      tx,
      revenue,
      avg: tx === 0 ? 0 : revenue / tx
    };
  });
}

// Pergerakan stok per minggu kalender zona bisnis (Senin) × alasan.
export async function queryMovementWeekly(businessId: string, from: Date, to: Date, tz: BizTz) {
  const weekExpr = localWeekStart(stockMovement.createdAt, tz);
  const rows = await db
    .select({
      week: sql<string>`(${weekExpr})::text`,
      reason: stockMovement.reason,
      qty: sql<string>`sum(${stockMovement.qtyChange})::text`
    })
    .from(stockMovement)
    .where(
      and(
        eq(stockMovement.businessId, businessId),
        gte(stockMovement.createdAt, from),
        lte(stockMovement.createdAt, to)
      )
    )
    .groupBy(weekExpr, stockMovement.reason);
  return rows.map((r) => ({ week: r.week, reason: r.reason, qty: Number(r.qty) }));
}

// Susut: total koreksi negatif (unit) + ≈ nilai pakai harga modal saat ini.
export async function querySusut(businessId: string, from: Date, to: Date) {
  const rows = await db
    .select({
      units: sql<string>`coalesce(sum(-${stockMovement.qtyChange}), 0)::text`,
      value: sql<string>`coalesce(sum(-${stockMovement.qtyChange}::bigint * ${product.costPrice}), 0)::text`
    })
    .from(stockMovement)
    .innerJoin(product, eq(product.id, stockMovement.productId))
    .where(
      and(
        eq(stockMovement.businessId, businessId),
        gte(stockMovement.createdAt, from),
        lte(stockMovement.createdAt, to),
        eq(stockMovement.reason, 'ADJUST'),
        sql`${stockMovement.qtyChange} < 0`
      )
    );
  const [r] = rows;
  return { units: Number(r?.units ?? 0), value: Number(r?.value ?? 0) };
}

// Data mentah panel inventori: semua produk + qty terjual 14 hari terakhir.
export async function queryInventory(businessId: string, now: Date, tz: BizTz) {
  // Jendela 14 hari dihitung dalam kalender zona bisnis.
  const T = makeTime(tz);
  const since = T.startOfDay(T.addDays(now, -(INVENTORY_WINDOW_DAYS - 1)));
  const [prods, soldRows] = await Promise.all([
    db
      .select({
        id: product.id,
        name: product.name,
        stock: product.stock,
        costPrice: product.costPrice,
        minStock: product.minStock,
        isActive: product.isActive
      })
      .from(product)
      .where(eq(product.businessId, businessId)),
    db
      .select({
        productId: transactionItem.productId,
        qty: sql<string>`sum(${transactionItem.quantity})::text`
      })
      .from(transactionItem)
      .innerJoin(transaction, eq(transaction.id, transactionItem.transactionId))
      .where(and(eq(transaction.businessId, businessId), gte(transaction.createdAt, since)))
      .groupBy(transactionItem.productId)
  ]);
  const sold = new Map(soldRows.map((r) => [r.productId, Number(r.qty)]));
  return {
    since,
    products: prods.map((p) => ({ ...p, sold14: sold.get(p.id) ?? 0 }))
  };
}

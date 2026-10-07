// Lapisan query Facts: SQL hanya menjumlahkan angka mentah; rumus turunan
// ada di lib/analytics. db di-inject: neon-http untuk app, postgres-js untuk script.
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { transaction, transactionItem } from '../../db/schema';
import type * as schema from '../../db/schema';
import { localDate, localHour } from '../../sql';
import type { BizTz } from '../../../shared/time';
import type { Facts } from '../../../analytics/facts';

// Handle DB yang diterima: database app (neon-http) atau database/handle
// transaksi script verifikasi (postgres-js). Hanya .select yang dipakai.
export type Db = NeonHttpDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

export type Range = { from: Date | null; to: Date | null };

// txCount = count(distinct transaction.id) per grup; jangan dijumlahkan lintas grup.
export type FactsRow = Facts & { txCount: number };

// qty = Σ quantity
// gross = Σ quantity × priceAtSale   (quantity di-cast bigint agar tidak overflow int4)
// discount = Σ discountAmount
// cost = Σ quantity × costAtSale   (cast bigint seperti gross)
// discountedQty = Σ discountedQty
export function factColumns() {
  return {
    qty: sql<string>`sum(${transactionItem.quantity})::text`,
    gross: sql<string>`sum(${transactionItem.quantity}::bigint * ${transactionItem.priceAtSale})::text`,
    discount: sql<string>`sum(${transactionItem.discountAmount})::text`,
    cost: sql<string>`sum(${transactionItem.quantity}::bigint * ${transactionItem.costAtSale})::text`,
    discountedQty: sql<string>`sum(${transactionItem.discountedQty})::text`
  };
}

// Baris agregat SQL (::text) → Facts. Produk tanpa histori tidak muncul di
// map; pemanggil mengisi ZERO_FACTS bila perlu.
export function toFacts(row: Record<string, string | null>): Facts {
  return {
    qty: Number(row.qty),
    gross: Number(row.gross),
    discount: Number(row.discount),
    cost: Number(row.cost),
    discountedQty: Number(row.discountedQty)
  };
}

function rangeConds(businessId: string, range: Range) {
  const conds = [eq(transaction.businessId, businessId)];
  if (range.from) conds.push(gte(transaction.createdAt, range.from));
  if (range.to) conds.push(lte(transaction.createdAt, range.to));
  return conds;
}

export async function queryFactsByProduct(
  db: Db,
  businessId: string,
  range: Range,
  opts?: { productIds?: string[] }
): Promise<Map<string, FactsRow>> {
  if (opts?.productIds && opts.productIds.length === 0) return new Map();
  const conds = rangeConds(businessId, range);
  if (opts?.productIds) conds.push(inArray(transactionItem.productId, opts.productIds));
  const facts = factColumns();
  const rows = await db
    .select({
      productId: transactionItem.productId,
      ...facts,
      txCount: sql<string>`count(distinct ${transaction.id})::text`
    })
    .from(transactionItem)
    .innerJoin(transaction, eq(transaction.id, transactionItem.transactionId))
    .where(and(...conds))
    .groupBy(transactionItem.productId);
  return new Map(rows.map((r) => [r.productId, { ...toFacts(r), txCount: Number(r.txCount) }]));
}

export async function queryFactsByDay(
  db: Db,
  businessId: string,
  range: Range,
  tz: BizTz,
  opts?: { productIds?: string[] }
): Promise<Map<string, FactsRow>> {
  if (opts?.productIds && opts.productIds.length === 0) return new Map();
  // Objek ekspresi yang sama dipakai di select & groupBy (lihat sql.ts).
  const dayExpr = localDate(transaction.createdAt, tz);
  const facts = factColumns();
  const conds = rangeConds(businessId, range);
  if (opts?.productIds) conds.push(inArray(transactionItem.productId, opts.productIds));
  const rows = await db
    .select({
      day: sql<string>`(${dayExpr})::text`,
      ...facts,
      txCount: sql<string>`count(distinct ${transaction.id})::text`
    })
    .from(transaction)
    .innerJoin(transactionItem, eq(transactionItem.transactionId, transaction.id))
    .where(and(...conds))
    .groupBy(dayExpr);
  return new Map(rows.map((r) => [r.day, { ...toFacts(r), txCount: Number(r.txCount) }]));
}

// Satu transaksi punya satu jam, jadi txCount aditif lintas jam.
export async function queryFactsByHour(
  db: Db,
  businessId: string,
  range: Range,
  tz: BizTz,
  opts?: { productIds?: string[] }
): Promise<Map<number, FactsRow>> {
  if (opts?.productIds && opts.productIds.length === 0) return new Map();
  const hourExpr = localHour(transaction.createdAt, tz);
  const facts = factColumns();
  const conds = rangeConds(businessId, range);
  if (opts?.productIds) conds.push(inArray(transactionItem.productId, opts.productIds));
  const rows = await db
    .select({
      hour: sql<string>`(${hourExpr})::text`,
      ...facts,
      txCount: sql<string>`count(distinct ${transaction.id})::text`
    })
    .from(transaction)
    .innerJoin(transactionItem, eq(transactionItem.transactionId, transaction.id))
    .where(and(...conds))
    .groupBy(hourExpr);
  return new Map(rows.map((r) => [Number(r.hour), { ...toFacts(r), txCount: Number(r.txCount) }]));
}

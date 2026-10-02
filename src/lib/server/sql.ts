// Helper SQL zona bisnis — AT TIME ZONE wajib literal.
// Ekspresi sama di SELECT dan GROUP BY butuh objek ekspresi yang sama
// agar Postgres tidak melempar error "must appear in the GROUP BY clause".
import { sql, type SQLWrapper } from 'drizzle-orm';
import type { BizTz } from '../shared/time';
import { transactionItem } from './db/schema';

// Literal zona dari tabel tetap, bukan dari input mentah — anti SQL injection.
const TZ_LITERAL: Record<BizTz, string> = {
  'Asia/Jakarta': `'Asia/Jakarta'`,
  'Asia/Makassar': `'Asia/Makassar'`,
  'Asia/Jayapura': `'Asia/Jayapura'`
};
const tzLit = (tz: BizTz) => {
  const lit = TZ_LITERAL[tz];
  if (!lit) throw new Error(`Zona waktu tidak valid: ${String(tz)}`);
  return sql.raw(lit); // literal dari tabel tetap, bukan dari input mentah
};

// createdAt bertipe timestamp (tanpa tz) yang menyimpan waktu UTC.
// Konversi: ((col AT TIME ZONE 'UTC') AT TIME ZONE '<zona bisnis>').
export const localTs = (col: SQLWrapper, tz: BizTz) =>
  sql`((${col} AT TIME ZONE 'UTC') AT TIME ZONE ${tzLit(tz)})`;
export const localDate = (col: SQLWrapper, tz: BizTz) => sql`(${localTs(col, tz)})::date`;
export const localHour = (col: SQLWrapper, tz: BizTz) =>
  sql`extract(hour from ${localTs(col, tz)})::int`;
export const localIsoDow = (col: SQLWrapper, tz: BizTz) =>
  sql`extract(isodow from ${localTs(col, tz)})::int`;
export const localWeekStart = (col: SQLWrapper, tz: BizTz) =>
  sql`(date_trunc('week', ${localTs(col, tz)}))::date`;

// lineNet = quantity * priceAtSale - discountAmount
// quantity dan discountAmount di-cast bigint agar tidak overflow int4.
export const lineNet = sql`(${transactionItem.quantity}::bigint * ${transactionItem.priceAtSale} - ${transactionItem.discountAmount}::bigint)`;

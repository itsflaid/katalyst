// Helper SQL zona bisnis — AT TIME ZONE wajib literal (bukan ${param}).
// Ekspresi yang sama di SELECT dan GROUP BY akan dapat nomor parameter beda
// → Postgres error "must appear in the GROUP BY clause". Makanya helper ini
// mengembalikan ekspresi literal, dan caller WAJIB memakai objek ekspresi
// yang sama untuk select dan groupBy.
import { sql, type SQLWrapper } from 'drizzle-orm';
import type { BizTz } from '../shared/time';

// Literal zona dari tabel tetap, BUKAN dari input mentah — anti SQL injection.
const TZ_LITERAL: Record<BizTz, string> = {
  'Asia/Jakarta': `'Asia/Jakarta'`,
  'Asia/Makassar': `'Asia/Makassar'`,
  'Asia/Jayapura': `'Asia/Jayapura'`
};
const tzLit = (tz: BizTz) => {
  const lit = TZ_LITERAL[tz];
  if (!lit) throw new Error(`Zona waktu tidak valid: ${String(tz)}`);
  return sql.raw(lit); // literal dari tabel tetap, BUKAN dari input mentah
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

// ---------------------------------------------------------------------------
// Wrapper lama — @deprecated, dipertahankan sementara sampai 0.5.
// ---------------------------------------------------------------------------
/** @deprecated pakai localTs(col, tz) */
export const witaTs = (col: SQLWrapper) => localTs(col, 'Asia/Makassar');
/** @deprecated pakai localDate(col, tz) */
export const witaDate = (col: SQLWrapper) => localDate(col, 'Asia/Makassar');
/** @deprecated pakai localHour(col, tz) */
export const witaHour = (col: SQLWrapper) => localHour(col, 'Asia/Makassar');
/** @deprecated pakai localIsoDow(col, tz) */
export const witaIsoDow = (col: SQLWrapper) => localIsoDow(col, 'Asia/Makassar');
/** @deprecated pakai localWeekStart(col, tz) */
export const witaWeekStart = (col: SQLWrapper) => localWeekStart(col, 'Asia/Makassar');

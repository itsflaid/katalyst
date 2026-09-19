// Helper SQL WITA — AT TIME ZONE wajib literal (bukan ${param}).
// Ekspresi yang sama di SELECT dan GROUP BY akan dapat nomor parameter beda
// → Postgres error "must appear in the GROUP BY clause". Makanya helper ini
// mengembalikan ekspresi literal, dan caller WAJIB memakai objek ekspresi
// yang sama untuk select dan groupBy.
import { sql, type SQLWrapper } from 'drizzle-orm';

// createdAt bertipe timestamp (tanpa tz) yang menyimpan waktu UTC.
// Konversi: ((col AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Makassar').
export const witaTs = (col: SQLWrapper) => sql`((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Makassar')`;
export const witaDate = (col: SQLWrapper) => sql`(${witaTs(col)})::date`;
export const witaHour = (col: SQLWrapper) => sql`extract(hour from ${witaTs(col)})::int`;
export const witaIsoDow = (col: SQLWrapper) => sql`extract(isodow from ${witaTs(col)})::int`;
export const witaWeekStart = (col: SQLWrapper) => sql`(date_trunc('week', ${witaTs(col)}))::date`;

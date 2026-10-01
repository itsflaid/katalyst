// Verifikasi helper SQL zona bisnis: literal AT TIME ZONE + GROUP BY aman.
// Read-only terhadap DB (hanya SELECT). Exit 1 bila ada FAIL.
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../src/lib/server/db/schema';
import { transaction } from '../src/lib/server/db/schema';
import { localDate, localHour, localTs } from '../src/lib/server/sql';
import { makeTime, type BizTz } from '../src/lib/shared/time';

let passCount = 0;
let failCount = 0;
function ok(label: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  \x1b[32mPASS\x1b[0m  ${label}`);
    passCount++;
  } else {
    console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? `: ${detail}` : ''}`);
    failCount++;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum di-set.');
  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client, { schema });
  // Pastikan makeTime tersedia (import relatif teresolusi oleh tsx).
  makeTime('Asia/Makassar');

  const zones: { tz: BizTz; date: string; hour: number }[] = [
    { tz: 'Asia/Jakarta', date: '2026-09-29', hour: 23 },
    { tz: 'Asia/Makassar', date: '2026-09-30', hour: 0 },
    { tz: 'Asia/Jayapura', date: '2026-09-30', hour: 1 }
  ];

  console.log('\n== tz-sql: konversi tanggal & jam ==');
  for (const z of zones) {
    const dateExpr = localDate(sql`timestamp '2026-09-29 16:30:00'`, z.tz);
    const hourExpr = localHour(sql`timestamp '2026-09-29 16:30:00'`, z.tz);
    const rows = await db.select({ d: sql<string>`(${dateExpr})::text`, h: sql<number>`${hourExpr}` }).from(transaction).limit(1);
    // Baris transaction mungkin kosong — pakai SELECT tanpa FROM bila perlu.
    let d: string;
    let h: number;
    if (rows.length > 0) {
      d = rows[0].d;
      h = Number(rows[0].h);
    } else {
      const r2 = await db.select({ d: sql<string>`(${dateExpr})::text`, h: sql<number>`${hourExpr}` }).from(sql`(select 1) s`);
      d = (r2 as { d: string; h: number }[])[0].d;
      h = Number((r2 as { d: string; h: number }[])[0].h);
    }
    ok(`${z.tz} date=${z.date}`, d === z.date, d);
    ok(`${z.tz} hour=${z.hour}`, h === z.hour, String(h));
  }

  console.log('\n== tz-sql: GROUP BY ekspresi sama ==');
  for (const z of zones) {
    const expr = localDate(transaction.createdAt, z.tz);
    let err = '';
    try {
      await db
        .select({ d: sql<string>`(${expr})::text`, c: sql<string>`count(*)::text` })
        .from(transaction)
        .groupBy(expr);
      ok(`${z.tz} group by tidak melempar`, true);
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
      ok(`${z.tz} group by tidak melempar`, false, err);
    }
  }

  console.log('\n== tz-sql: zona invalid melempar sebelum query ==');
  let threw = false;
  try {
    localTs(transaction.createdAt, 'Asia/Tokyo' as BizTz);
  } catch {
    threw = true;
  }
  ok('localTs(Tokyo) melempar', threw);

  await client.end();
  console.log(`\n${passCount} passed, ${failCount} failed\n`);
  if (failCount > 0) process.exit(1);
}

main();

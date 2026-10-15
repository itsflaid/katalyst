import { db } from '$lib/server/db';
import type { BatchItem } from 'drizzle-orm/batch';

// neon-http tanpa transaksi interaktif: batch = satu transaksi (gagal satu = rollback semua).
// Satu-satunya cast tuple batch ada di sini.
export async function runBatch(statements: BatchItem<'pg'>[]): Promise<void> {
  await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]]);
}

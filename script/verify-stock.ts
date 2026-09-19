// Verifikasi invarian ledger: untuk tiap produk yang punya ledger,
// Σ qty_change HARUS == product.stock. Produk lama tanpa ledger dilaporkan
// sebagai "tanpa ledger" (bukan gagal). Exit 1 bila ada selisih.
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/server/db/schema';
import { product, stockMovement } from '../src/lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL belum di-set. Cek .env / .env.example.');
}

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

const products = await db
  .select({ id: product.id, name: product.name, stock: product.stock, businessId: product.businessId })
  .from(product);

let failCount = 0;
let noLedgerCount = 0;

for (const p of products) {
  const rows = await db
    .select({ total: sql<string>`coalesce(sum(${stockMovement.qtyChange}), 0)::text` })
    .from(stockMovement)
    .where(eq(stockMovement.productId, p.id));
  const total = Number(rows[0]?.total ?? 0);
  // Cek apakah produk punya ledger sama sekali.
  const has = await db
    .select({ id: stockMovement.id })
    .from(stockMovement)
    .where(eq(stockMovement.productId, p.id))
    .limit(1);
  if (has.length === 0) {
    console.log(`  SKIP  ${p.name}: tanpa ledger (produk lama)`);
    noLedgerCount++;
    continue;
  }
  if (total !== p.stock) {
    console.log(`  \x1b[31mFAIL\x1b[0m  ${p.name}: Σ ledger ${total} != stock ${p.stock} (selisih ${total - p.stock})`);
    failCount++;
  } else {
    console.log(`  \x1b[32mPASS\x1b[0m  ${p.name}: Σ ledger ${total} == stock ${p.stock}`);
  }
}

console.log(`\n${products.length - failCount - noLedgerCount} cocok, ${noLedgerCount} tanpa ledger, ${failCount} selisih\n`);
await client.end();
if (failCount > 0) process.exit(1);

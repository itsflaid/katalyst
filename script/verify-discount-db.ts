// Verifikasi constraint DB diskon: satu transaksi di-rollback; tes negatif per
// savepoint agar kegagalan satu statement tak menggugurkan sisanya. PASS/FAIL
// per nama constraint; exit 1 bila ada FAIL.
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import * as schema from '../src/lib/server/db/schema';
import { business, product, discount, transaction, transactionItem } from '../src/lib/server/db/schema';
import { lineNet } from '../src/lib/server/sql';
import { calculateRevenue } from '../src/lib/analytics';

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

// Ekstrak nama constraint dari error drizzle/postgres-js: drizzle membungkus
// error asli di `.cause` (PostgresError dengan field `constraint_name`).
// Fallback ke regex pesan `violates check constraint "nama"`.
function constraintOf(e: unknown): string {
  const err = e as { cause?: { constraint_name?: string; message?: string }; message?: string };
  if (typeof err?.cause?.constraint_name === 'string' && err.cause.constraint_name) return err.cause.constraint_name;
  const hay = `${err?.message ?? ''} ${err?.cause?.message ?? ''}`;
  return /constraint "([^"]+)"/.exec(hay)?.[1] ?? '';
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum di-set.');
  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client, { schema });
  const ROLLBACK = new Error('__rollback_fixture__');

  try {
    await db.transaction(async (tx) => {
      // Fixture: 1 bisnis + 1 produk + 1 struk (dipakai tes item).
      const biz = randomUUID();
      await tx.insert(business).values({ id: biz, name: 'Fixture Diskon' });
      const prod = randomUUID();
      await tx.insert(product).values({
        id: prod,
        businessId: biz,
        name: 'Fixture Produk',
        costPrice: 6000,
        sellingPrice: 10000,
        stock: 100
      });
      const txId = randomUUID();
      await tx.insert(transaction).values({ id: txId, businessId: biz });

      // Tes negatif: gagal + nama constraint cocok = PASS.
      async function expectFail(label: string, constraint: string, fn: (s: typeof tx) => Promise<unknown>) {
        try {
          // Savepoint: gagal di sini tidak menggugurkan transaksi luar.
          await tx.transaction(async (s) => {
            await fn(s as typeof tx);
          });
          ok(label, false, 'seharusnya gagal tapi sukses');
        } catch (e) {
          const got = constraintOf(e);
          ok(label, got === constraint, `constraint=${got || String(e).slice(0, 120)}`);
        }
      }

      // 1. percent di luar 1–100.
      await expectFail('percent=0 ditolak', 'discount_percent_range', (s) =>
        s.insert(discount).values({ id: randomUUID(), businessId: biz, name: 'D', scope: 'GLOBAL', percent: 0, endsAt: new Date(Date.now() + 3600_000) })
      );
      await expectFail('percent=101 ditolak', 'discount_percent_range', (s) =>
        s.insert(discount).values({ id: randomUUID(), businessId: biz, name: 'D', scope: 'GLOBAL', percent: 101, endsAt: new Date(Date.now() + 3600_000) })
      );
      // 2. scope vs productId.
      await expectFail('PRODUCT tanpa productId ditolak', 'discount_scope_product', (s) =>
        s.insert(discount).values({ id: randomUUID(), businessId: biz, name: 'D', scope: 'PRODUCT', percent: 10 })
      );
      await expectFail('GLOBAL dengan productId ditolak', 'discount_scope_product', (s) =>
        s.insert(discount).values({ id: randomUUID(), businessId: biz, name: 'D', scope: 'GLOBAL', percent: 10, productId: prod, endsAt: new Date(Date.now() + 3600_000) })
      );
      // 3. endsAt <= startsAt.
      const now = new Date();
      await expectFail('endsAt <= startsAt ditolak', 'discount_window_valid', (s) =>
        s.insert(discount).values({ id: randomUUID(), businessId: biz, name: 'D', scope: 'PRODUCT', percent: 10, productId: prod, startsAt: now, endsAt: now })
      );
      // 4. quota = 0.
      await expectFail('quota=0 ditolak', 'discount_quota_valid', (s) =>
        s.insert(discount).values({ id: randomUUID(), businessId: biz, name: 'D', scope: 'PRODUCT', percent: 10, productId: prod, quota: 0 })
      );
      // 5. quota_used melampaui quota via update.
      const q5 = randomUUID();
      await tx.insert(discount).values({ id: q5, businessId: biz, name: 'Q5', scope: 'PRODUCT', percent: 10, productId: prod, quota: 5 });
      await expectFail('quota_used 0+6 > quota 5 ditolak', 'discount_quota_not_exceeded', (s) =>
        s.update(discount).set({ quotaUsed: 6 }).where(eq(discount.id, q5))
      );
      // 6. quota_used negatif.
      await expectFail('quota_used=-1 ditolak', 'discount_quota_used_nonneg', (s) =>
        s.update(discount).set({ quotaUsed: -1 }).where(eq(discount.id, q5))
      );
      // 7. Aturan khusus GLOBAL.
      await expectFail('GLOBAL tanpa endsAt ditolak', 'discount_global_time_only', (s) =>
        s.insert(discount).values({ id: randomUUID(), businessId: biz, name: 'G', scope: 'GLOBAL', percent: 10 })
      );
      await expectFail('GLOBAL dengan quota ditolak', 'discount_global_time_only', (s) =>
        s.insert(discount).values({ id: randomUUID(), businessId: biz, name: 'G', scope: 'GLOBAL', percent: 10, quota: 5, endsAt: new Date(Date.now() + 3600_000) })
      );
      // 8. Baris item tak valid.
      const badItem = (over: Record<string, number>) =>
        tx.transaction(async (s) =>
          s.insert(transactionItem).values({
            id: randomUUID(),
            transactionId: txId,
            productId: prod,
            quantity: 2,
            priceAtSale: 10000,
            costAtSale: 6000,
            discountedQty: 0,
            discountAmount: 0,
            ...over
          })
        );
      for (const [label, over] of [
        ['discounted_qty > quantity ditolak', { discountedQty: 3 }],
        ['discount_amount > qty*price ditolak', { discountedQty: 2, discountAmount: 20001 }],
        ['discount_amount < 0 ditolak', { discountAmount: -1 }]
      ] as const) {
        try {
          await badItem(over);
          ok(label, false, 'seharusnya gagal tapi sukses');
        } catch (e) {
          const got = constraintOf(e);
          ok(label, got === 'transaction_item_discount_valid', `constraint=${got}`);
        }
      }
      // 9. Insert valid: PRODUCT (quota null, endsAt null) & GLOBAL (endsAt terisi).
      try {
        await tx.insert(discount).values({ id: randomUUID(), businessId: biz, name: 'P-OK', scope: 'PRODUCT', percent: 15, productId: prod });
        await tx.insert(discount).values({ id: randomUUID(), businessId: biz, name: 'G-OK', scope: 'GLOBAL', percent: 10, endsAt: new Date(Date.now() + 3600_000) });
        ok('insert PRODUCT & GLOBAL valid sukses', true);
      } catch (e) {
        ok('insert PRODUCT & GLOBAL valid sukses', false, String(e).slice(0, 160));
      }
      // 10. quota_used tepat = quota sukses.
      try {
        await tx.update(discount).set({ quotaUsed: 5 }).where(eq(discount.id, q5));
        ok('quota_used = quota (5/5) sukses', true);
      } catch (e) {
        ok('quota_used = quota (5/5) sukses', false, String(e).slice(0, 160));
      }
      // 11. Hapus produk berdiskon (tanpa item) → diskon ikut terhapus.
      try {
        const prod2 = randomUUID();
        const disc2 = randomUUID();
        await tx.insert(product).values({ id: prod2, businessId: biz, name: 'P2', costPrice: 1000, sellingPrice: 2000, stock: 10 });
        await tx.insert(discount).values({ id: disc2, businessId: biz, name: 'D2', scope: 'PRODUCT', percent: 10, productId: prod2 });
        await tx.delete(product).where(eq(product.id, prod2));
        const left = await tx.select({ id: discount.id }).from(discount).where(eq(discount.id, disc2));
        ok('hapus produk → diskon cascade hilang', left.length === 0);
      } catch (e) {
        ok('hapus produk → diskon cascade hilang', false, String(e).slice(0, 160));
      }

      // 12. Paritas: selama semua discount_amount = 0, sum(lineNet) harus
      // sama dengan sum(qty×price) — di seluruh data (termasuk fixture
      // di atas yang semuanya berdikon-nol).
      {
        const [par] = await tx
          .select({
            net: sql<string>`coalesce(sum(${lineNet}), 0)::text`,
            gross: sql<string>`coalesce(sum(${transactionItem.quantity}::bigint * ${transactionItem.priceAtSale}), 0)::text`
          })
          .from(transactionItem);
        ok('paritas sum(net) == sum(gross) saat diskon 0', par.net === par.gross, `net=${par.net} gross=${par.gross}`);
      }

      // 13. Kesesuaian SQL vs JS: 1 struk fixture (2 item, salah satunya
      // discountedQty 3 + discountAmount 4500); sum(lineNet) == calculateRevenue.
      {
        const fxTx = randomUUID();
        await tx.insert(transaction).values({ id: fxTx, businessId: biz });
        await tx.insert(transactionItem).values([
          { id: randomUUID(), transactionId: fxTx, productId: prod, quantity: 3, priceAtSale: 10000, costAtSale: 6000, discountedQty: 3, discountAmount: 4500 },
          { id: randomUUID(), transactionId: fxTx, productId: prod, quantity: 1, priceAtSale: 20000, costAtSale: 12000, discountedQty: 0, discountAmount: 0 }
        ]);
        const [crow] = await tx
          .select({ net: sql<string>`coalesce(sum(${lineNet}), 0)::text` })
          .from(transactionItem)
          .where(eq(transactionItem.transactionId, fxTx));
        const js = calculateRevenue([
          { productId: prod, quantity: 3, priceAtSale: 10000, costAtSale: 6000, discountAmount: 4500 },
          { productId: prod, quantity: 1, priceAtSale: 20000, costAtSale: 12000 }
        ]);
        ok('kesesuaian SQL sum(lineNet) == JS calculateRevenue', Number(crow.net) === js, `sql=${crow.net} js=${js}`);
      }

      throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  await client.end();
  console.log(`\n${passCount} passed, ${failCount} failed\n`);
  if (failCount > 0) process.exit(1);
}

main();

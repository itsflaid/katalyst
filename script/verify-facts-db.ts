// Verifikasi lapisan query Facts vs lipatan JS (D1-D6).
// Semua di dalam SATU transaksi yang di-rollback — pola verify-discount-db.
// Fixture: 1 bisnis + 3 produk + struk di beberapa hari (termasuk sekitar
// tengah malam tiap zona), sebagian item berdiskon / diskon parsial
// (kuota habis di tengah keranjang); bisnis kedua sebagai pengganggu.
// Handle transaksi diteruskan sebagai `db` (gunanya dependency injection).
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import * as schema from '../src/lib/server/db/schema';
import { business, product, transaction, transactionItem } from '../src/lib/server/db/schema';
import { queryFactsByProduct, queryFactsByDay, type Range } from '../src/lib/server/domains/facts/queries';
import { factsOfItem, metricsOf, sumFacts, calculateRevenue, type Facts } from '../src/lib/analytics';
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

const TZS: BizTz[] = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'];

interface RawRow {
  productId: string;
  quantity: number;
  priceAtSale: number;
  costAtSale: number;
  discountAmount: number;
  discountedQty: number;
  txId: string;
  createdAt: Date;
}

function inRange(d: Date, r: Range): boolean {
  if (r.from && d < r.from) return false;
  if (r.to && d > r.to) return false;
  return true;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum di-set.');
  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client, { schema });
  const ROLLBACK = new Error('__rollback_fixture__');

  try {
    await db.transaction(async (tx) => {
      const biz = randomUUID();
      const biz2 = randomUUID();
      await tx.insert(business).values([{ id: biz, name: 'Fixture Facts' }, { id: biz2, name: 'Pengganggu' }]);
      const [A, B, C, X] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
      await tx.insert(product).values([
        { id: A, businessId: biz, name: 'A', costPrice: 6000, sellingPrice: 10000, stock: 1000 },
        { id: B, businessId: biz, name: 'B', costPrice: 12000, sellingPrice: 20000, stock: 1000 },
        { id: C, businessId: biz, name: 'C', costPrice: 3000, sellingPrice: 5000, stock: 1000 },
        { id: X, businessId: biz2, name: 'X', costPrice: 1000, sellingPrice: 2000, stock: 1000 }
      ]);

      // T1: batas tengah malam (16:30Z = WIB 23:30 29 Sep, WITA/WIT 30 Sep).
      // A parsial: qty 8, 5 kena diskon 15% (unit 1500) — kuota habis di tengah.
      const t1 = randomUUID();
      await tx.insert(transaction).values({ id: t1, businessId: biz, createdAt: new Date('2026-09-29T16:30:00Z') });
      await tx.insert(transactionItem).values([
        { id: randomUUID(), transactionId: t1, productId: A, quantity: 8, priceAtSale: 10000, costAtSale: 6000, discountedQty: 5, discountAmount: 7500 },
        { id: randomUUID(), transactionId: t1, productId: B, quantity: 2, priceAtSale: 20000, costAtSale: 12000, discountedQty: 0, discountAmount: 0 }
      ]);
      const t2 = randomUUID();
      await tx.insert(transaction).values({ id: t2, businessId: biz, createdAt: new Date('2026-09-10T10:00:00Z') });
      await tx.insert(transactionItem).values([
        { id: randomUUID(), transactionId: t2, productId: A, quantity: 3, priceAtSale: 10000, costAtSale: 6000, discountedQty: 0, discountAmount: 0 },
        { id: randomUUID(), transactionId: t2, productId: C, quantity: 4, priceAtSale: 5000, costAtSale: 3000, discountedQty: 4, discountAmount: 4000 }
      ]);
      // T3/T4: mengapit tengah malam WITA (23:59 14 Sep / 00:01 15 Sep).
      const t3 = randomUUID();
      await tx.insert(transaction).values({ id: t3, businessId: biz, createdAt: new Date('2026-09-14T15:59:00Z') });
      await tx.insert(transactionItem).values([
        { id: randomUUID(), transactionId: t3, productId: B, quantity: 1, priceAtSale: 20000, costAtSale: 12000, discountedQty: 1, discountAmount: 2000 }
      ]);
      const t4 = randomUUID();
      await tx.insert(transaction).values({ id: t4, businessId: biz, createdAt: new Date('2026-09-14T16:01:00Z') });
      await tx.insert(transactionItem).values([
        { id: randomUUID(), transactionId: t4, productId: A, quantity: 1, priceAtSale: 10000, costAtSale: 6000, discountedQty: 0, discountAmount: 0 }
      ]);
      // Bisnis pengganggu.
      const tg = randomUUID();
      await tx.insert(transaction).values({ id: tg, businessId: biz2, createdAt: new Date('2026-09-10T10:00:00Z') });
      await tx.insert(transactionItem).values([
        { id: randomUUID(), transactionId: tg, productId: X, quantity: 100, priceAtSale: 2000, costAtSale: 1000, discountedQty: 0, discountAmount: 0 }
      ]);

      const raw: RawRow[] = (
        await tx
          .select({
            productId: transactionItem.productId,
            quantity: transactionItem.quantity,
            priceAtSale: transactionItem.priceAtSale,
            costAtSale: transactionItem.costAtSale,
            discountAmount: transactionItem.discountAmount,
            discountedQty: transactionItem.discountedQty,
            txId: transactionItem.transactionId,
            createdAt: transaction.createdAt
          })
          .from(transactionItem)
          .innerJoin(transaction, eq(transaction.id, transactionItem.transactionId))
          .where(eq(transaction.businessId, biz))
      ).map((r) => ({ ...r, createdAt: new Date(r.createdAt) }));

      const WITA = makeTime('Asia/Makassar');
      const ranges: Record<string, Range> = {
        semua: { from: null, to: null },
        terbatas: { from: new Date('2026-09-10T00:00:00Z'), to: new Date('2026-09-20T00:00:00Z') },
        // Tepat 15 Sep kalender WITA (memuat T4 saja).
        satuHari: { from: WITA.startOfDay(new Date('2026-09-14T16:01:00Z')), to: WITA.endOfDay(new Date('2026-09-14T16:01:00Z')) }
      };

      const eqFacts = (a: Facts, b: Facts) =>
        a.qty === b.qty && a.gross === b.gross && a.discount === b.discount && a.cost === b.cost && a.discountedQty === b.discountedQty;

      // D1: ΣbyProduct = ΣbyDay = lipatan JS, semua rentang × semua zona.
      console.log('\n== D1: agregat SQL ≡ lipatan JS ==');
      for (const [rname, range] of Object.entries(ranges)) {
        const inR = raw.filter((r) => inRange(r.createdAt, range));
        const jsFold = sumFacts(inR.map(factsOfItem));
        const byProduct = await queryFactsByProduct(tx, biz, range);
        const sumP = sumFacts([...byProduct.values()]);
        ok(`${rname}: ΣbyProduct ≡ JS`, eqFacts(sumP, jsFold), JSON.stringify({ sumP, jsFold }));
        for (const tz of TZS) {
          const T = makeTime(tz);
          const byDay = await queryFactsByDay(tx, biz, range, tz);
          const sumD = sumFacts([...byDay.values()]);
          // Kunci hari = dayKey zona bisnis atas instant yang sama.
          const jsByDay = new Map<string, Facts>();
          for (const r of inR) {
            const k = T.dayKey(r.createdAt);
            const cur = jsByDay.get(k);
            jsByDay.set(k, cur ? sumFacts([cur, factsOfItem(r)]) : factsOfItem(r));
          }
          const keysOk =
            [...byDay.keys()].sort().join(',') === [...jsByDay.keys()].sort().join(',') &&
            [...byDay.entries()].every(([k, v]) => eqFacts(v, jsByDay.get(k)!));
          ok(`${rname} × ${tz}: ΣbyDay ≡ JS + kunci hari benar`, eqFacts(sumD, jsFold) && keysOk);
        }
      }

      // D2: revenue SQL ≡ calculateRevenue atas baris mentah.
      console.log('\n== D2: revenue ≡ calculateRevenue ==');
      {
        const byProduct = await queryFactsByProduct(tx, biz, { from: null, to: null });
        const m = metricsOf(sumFacts([...byProduct.values()]));
        const js = calculateRevenue(raw.map((r) => ({ ...r })));
        ok('metricsOf(facts).revenue = calculateRevenue', m.revenue === js, `sql=${m.revenue} js=${js}`);
      }

      // D3: filter productIds.
      console.log('\n== D3: filter productIds ==');
      {
        const only = await queryFactsByProduct(tx, biz, { from: null, to: null }, { productIds: [A] });
        ok('hanya A', only.size === 1 && only.has(A), [...only.keys()].join(','));
        const empty = await queryFactsByProduct(tx, biz, { from: null, to: null }, { productIds: [] });
        ok('array kosong → map kosong', empty.size === 0);
      }

      // D4: txCount distinct per grup; Σ harian = total distinct.
      console.log('\n== D4: txCount ==');
      {
        const byProduct = await queryFactsByProduct(tx, biz, { from: null, to: null });
        const jsCount = (pid: string) => new Set(raw.filter((r) => r.productId === pid).map((r) => r.txId)).size;
        ok('txCount A=3 B=2 C=1', byProduct.get(A)!.txCount === 3 && byProduct.get(B)!.txCount === 2 && byProduct.get(C)!.txCount === 1,
          `A=${byProduct.get(A)!.txCount} B=${byProduct.get(B)!.txCount} C=${byProduct.get(C)!.txCount} js=${jsCount(A)},${jsCount(B)},${jsCount(C)}`);
        const byDay = await queryFactsByDay(tx, biz, { from: null, to: null }, 'Asia/Makassar');
        const sumTx = [...byDay.values()].reduce((s, r) => s + r.txCount, 0);
        const distinct = new Set(raw.map((r) => r.txId)).size;
        ok(`Σ txCount harian (${sumTx}) = distinct (${distinct})`, sumTx === distinct && distinct === 4);
        // T4 sendirian di harinya (WITA 15 Sep).
        const keyT4 = WITA.dayKey(new Date('2026-09-14T16:01:00Z'));
        ok('T4 satu-satunya di 15 Sep WITA', byDay.get(keyT4)?.txCount === 1, keyT4);
      }

      // D5: rentang kosong → map kosong.
      console.log('\n== D5: rentang kosong ==');
      {
        const kosong: Range = { from: new Date('2020-01-01T00:00:00Z'), to: new Date('2020-01-31T00:00:00Z') };
        const p = await queryFactsByProduct(tx, biz, kosong);
        const d = await queryFactsByDay(tx, biz, kosong, 'Asia/Makassar');
        ok('map kosong tanpa error', p.size === 0 && d.size === 0);
      }

      // D6: isolasi tenant.
      console.log('\n== D6: isolasi tenant ==');
      {
        const bizMap = await queryFactsByProduct(tx, biz, { from: null, to: null });
        const biz2Map = await queryFactsByProduct(tx, biz2, { from: null, to: null });
        ok('bisnis lain tak ikut', !bizMap.has(X) && biz2Map.size === 1 && biz2Map.has(X));
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

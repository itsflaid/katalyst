import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import * as schema from './schema';
import { business, user, product, transaction, transactionItem, stockMovement } from './schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// -----------------------------------------------------------------------
// Script ini di-run standalone lewat `tsx` (bukan lewat SvelteKit/Vite), jadi
// TIDAK bisa import src/lib/server/db/index.ts atau src/lib/server/auth.ts
// apa adanya — keduanya pakai `$env/dynamic/private`, virtual module yang
// cuma ke-resolve di dalam Vite runtime (sudah kebukti langsung: `tsx` bakal
// lempar ERR_MODULE_NOT_FOUND). Makanya di sini dibikin db client & instance
// betterAuth sendiri dari process.env (pola sama kayak drizzle.config.ts).
// Password hash (scrypt) yang dihasilkan tetap kompatibel dibaca app utama,
// karena keduanya baca dari tabel `account` yang sama.
// -----------------------------------------------------------------------

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL belum di-set. Cek .env / .env.example.');
}

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:5173',
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: true, minPasswordLength: 6 },
  user: {
    additionalFields: {
      role: { type: 'string', required: false, defaultValue: 'OWNER', input: false },
      businessId: { type: 'string', required: false, input: false }
    }
  }
});

// -----------------------------------------------------------------------
// Seed data: "Cindera Etam" — toko oleh-oleh khas Kalimantan Timur, dipakai
// sebagai demo data portfolio. Semua yang dijual adalah BARANG berstok
// (bukan masakan racik) — konsisten dengan invarian stok aplikasi.
//
// 10 produk ini SENGAJA dikasih variasi biar lib/analytics.ts &
// lib/simulation.ts ada "bahan" buat didemoin, bukan cuma nama doang:
//  - margin spread 14%-50% (Kerupuk Ikan Curah sengaja tipis ~14% tapi laris
//    → bahan insight "laris tapi margin tipis" + kuadran matriks)
//  - 3 tingkat volatilitas harga beli dari supplier/pengrajin
//    (rendah/sedang/tinggi) -> bahan simulasi "harga beli naik X%"
//  - 1 produk musiman ekstrem (Kaos Pesut Mahakam, spike sekitar HUT RI
//    17 Agustus, bukan Ramadan — Ramadan 2026 jatuh Feb-Mar, di luar
//    window 90 hari data ini, jadi dipakai momentum lokal yang beneran
//    match kalender)
//  - 2 produk dibuat menipis (Madu Kelulut & Sarung Samarinda) → bahan kartu
//    "Perlu restock" di dashboard
// -----------------------------------------------------------------------

type Volatility = 'low' | 'medium' | 'high';

interface SeedProduct {
  name: string;
  costPrice: number;
  sellingPrice: number;
  qtyMin: number;
  qtyMax: number;
  volatility: Volatility;
  /** Stok akhir demo. */
  stock: number;
  /** Ambang menipis (default 5). */
  minStock?: number;
  /** Produk musiman ekstrem: qty ~0 di luar spike window. */
  seasonalOnly?: boolean;
}

const VOLATILITY_FACTOR: Record<Volatility, number> = {
  low: 0.03,
  medium: 0.08,
  high: 0.2
};

const PRODUCTS: SeedProduct[] = [
  { name: 'Amplang Ikan Tenggiri 250g', costPrice: 22000, sellingPrice: 35000, qtyMin: 8, qtyMax: 15, volatility: 'low', stock: 120 },
  { name: 'Amplang Udang 200g', costPrice: 24000, sellingPrice: 40000, qtyMin: 5, qtyMax: 10, volatility: 'low', stock: 90 },
  { name: 'Kerupuk Kepiting 250g', costPrice: 26000, sellingPrice: 42000, qtyMin: 4, qtyMax: 8, volatility: 'medium', stock: 70 },
  { name: 'Abon Ikan 150g', costPrice: 28000, sellingPrice: 45000, qtyMin: 3, qtyMax: 7, volatility: 'medium', stock: 60 },
  { name: 'Terasi Udang 250g', costPrice: 12000, sellingPrice: 22000, qtyMin: 4, qtyMax: 9, volatility: 'low', stock: 80 },
  { name: 'Keripik Pisang Manis 200g', costPrice: 11000, sellingPrice: 20000, qtyMin: 10, qtyMax: 18, volatility: 'low', stock: 150 },
  { name: 'Kerupuk Ikan Curah 500g', costPrice: 18000, sellingPrice: 21000, qtyMin: 15, qtyMax: 25, volatility: 'low', stock: 200 },
  { name: 'Madu Kelulut Kaltim 250ml', costPrice: 45000, sellingPrice: 75000, qtyMin: 2, qtyMax: 5, volatility: 'high', stock: 6, minStock: 10 },
  { name: 'Sarung Samarinda', costPrice: 250000, sellingPrice: 400000, qtyMin: 0, qtyMax: 2, volatility: 'high', stock: 3, minStock: 5 },
  {
    name: 'Kaos Pesut Mahakam',
    costPrice: 45000,
    sellingPrice: 90000,
    qtyMin: 6,
    qtyMax: 12,
    volatility: 'medium',
    stock: 100,
    seasonalOnly: true
  }
];

const HISTORY_DAYS = 90;
const SPIKE_MONTH = 7; // Agustus (0-indexed) — window HUT RI, dalam range 90 hari dari 16 Sep 2026
const SPIKE_DAY_START = 10;
const SPIKE_DAY_END = 20;

// Seeded PRNG (mulberry32) biar data reproducible tiap kali seed dijalankan
// ulang — pola yang sama dipakai di layout seeded DevMap Skills component.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260916);

function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function isSpikeWindow(date: Date): boolean {
  return (
    date.getUTCMonth() === SPIKE_MONTH &&
    date.getUTCDate() >= SPIKE_DAY_START &&
    date.getUTCDate() <= SPIKE_DAY_END
  );
}

function applyVolatility(base: number, level: Volatility): number {
  const factor = VOLATILITY_FACTOR[level];
  const delta = (rand() * 2 - 1) * factor;
  return Math.max(1, Math.round(base * (1 + delta)));
}

// Jam 8-21 yang dimaksud adalah jam dinding WITA (bukan UTC): 08.00 WITA =
// 00.00 UTC, jadi jam UTC = jam WITA - 8.
function witaTime(base: Date, hourWita: number, minute: number): Date {
  const d = new Date(base);
  d.setUTCHours(hourWita - 8, minute, 0, 0);
  return d;
}

async function main() {
  console.log('Seeding Katalyst (Cindera Etam) dummy data...');

  const businessId = randomUUID();
  await db.insert(business).values({ id: businessId, name: 'Cindera Etam' });

  // Bikin user lewat auth.api.signUpEmail (bukan db.insert manual) supaya
  // password di-hash beneran sama better-auth (scrypt) dan row `account`
  // (providerId "credential") ke-generate otomatis dengan bentuk yang benar.
  // Baru abis itu businessId/role di-patch manual karena signUpEmail cuma
  // tau field bawaan + additionalFields yang diizinkan diisi dari client.
  const ownerSignUp = await auth.api.signUpEmail({
    body: { email: 'owner@test.com', password: 'password', name: 'Owner Demo' }
  });
  const staffSignUp = await auth.api.signUpEmail({
    body: { email: 'staff@test.com', password: 'password', name: 'Budi (Staff)' }
  });

  const ownerId = ownerSignUp.user.id;
  const staffId = staffSignUp.user.id;

  await db.update(user).set({ role: 'OWNER', businessId }).where(eq(user.id, ownerId));
  await db.update(user).set({ role: 'STAFF', businessId }).where(eq(user.id, staffId));

  const productIds: Record<string, string> = {};
  for (const p of PRODUCTS) {
    const id = randomUUID();
    productIds[p.name] = id;
    await db.insert(product).values({
      id,
      businessId,
      name: p.name,
      costPrice: p.costPrice,
      sellingPrice: p.sellingPrice,
      stock: p.stock,
      minStock: p.minStock ?? 5
    });
  }

  const now = new Date();
  let totalTx = 0;

  // Row-row di sini dikumpulin di memory dulu (bukan langsung di-insert),
  // biar insert-nya bisa di-batch sekaligus di luar loop — lihat alasannya
  // di komentar sebelum blok "Batch insert" di bawah.
  const txRows: { id: string; businessId: string; userId: string; createdAt: Date }[] = [];
  const itemRows: {
    id: string;
    transactionId: string;
    productId: string;
    quantity: number;
    priceAtSale: number;
    costAtSale: number;
  }[] = [];
  const saleLedger: {
    id: string;
    businessId: string;
    productId: string;
    qtyChange: number;
    reason: 'SALE';
    refTxId: string;
    createdAt: Date;
    createdBy: string;
  }[] = [];

  // Penjualan per produk per hari (dipakai juga buat hitung restock mingguan).
  const dailySales: number[][] = PRODUCTS.map(() => new Array(HISTORY_DAYS).fill(0));

  for (let dayOffset = HISTORY_DAYS - 1; dayOffset >= 0; dayOffset--) {
    const dayIdx = HISTORY_DAYS - 1 - dayOffset;
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() - dayOffset);
    day.setUTCHours(0, 0, 0, 0);

    const weekend = isWeekend(day);
    const spike = isSpikeWindow(day);

    for (let pi = 0; pi < PRODUCTS.length; pi++) {
      const p = PRODUCTS[pi];
      let targetQty: number;

      if (p.seasonalOnly) {
        targetQty = spike ? randInt(p.qtyMin, p.qtyMax) : randInt(0, 2); // nyaris 0 di luar musim
      } else {
        targetQty = randInt(p.qtyMin, p.qtyMax);
        if (weekend) targetQty = Math.round(targetQty * 1.25); // demand toko naik pas weekend/libur
      }

      if (targetQty <= 0) continue;
      dailySales[pi][dayIdx] = targetQty;

      // Pecah jadi beberapa transaksi (1-3 unit per transaksi), niru pola
      // pesanan asli, bukan 1 transaksi raksasa per produk per hari.
      let remaining = targetQty;
      while (remaining > 0) {
        const qty = Math.min(remaining, randInt(1, 3));
        remaining -= qty;

        const costAtSale = applyVolatility(p.costPrice, p.volatility);
        // Jam transaksi 08-21 WITA (dibangkitkan sebagai jam dinding WITA).
        const createdAt = witaTime(day, randInt(8, 21), randInt(0, 59));

        const txId = randomUUID();
        const servedBy = rand() < 0.7 ? staffId : ownerId;

        txRows.push({ id: txId, businessId, userId: servedBy, createdAt });
        itemRows.push({
          id: randomUUID(),
          transactionId: txId,
          productId: productIds[p.name],
          quantity: qty,
          priceAtSale: p.sellingPrice,
          costAtSale
        });
        // 1 baris SALE per item (ref_tx_id + waktu = waktu struk).
        saleLedger.push({
          id: randomUUID(),
          businessId,
          productId: productIds[p.name],
          qtyChange: -qty,
          reason: 'SALE',
          refTxId: txId,
          createdAt,
          createdBy: servedBy
        });

        totalTx++;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Ledger konsisten: Σ qty_change per produk HARUS == product.stock.
  //  - RESTOCK mingguan ≈ 0,9 × penjualan minggu sebelumnya per produk
  //    ("Kirim dari supplier"), ditaruh Senin jam 09.00 WITA.
  //  - 2-3 ADJUST negatif demo ("opname: rusak/kedaluwarsa").
  //  - 1 RESTOCK awal ("Stok awal") di hari pertama: penyeimbang
  //    (stok_akhir + terjual − restock_mingguan − adjust). Selalu ≥ 0 karena
  //    restock mingguan cuma 0,9× penjualan.
  // -----------------------------------------------------------------------
  const otherLedger: {
    id: string;
    businessId: string;
    productId: string;
    qtyChange: number;
    reason: 'RESTOCK' | 'ADJUST';
    note: string;
    createdAt: Date;
    createdBy: string;
  }[] = [];

  const WEEK = 7;
  const weekCount = Math.ceil(HISTORY_DAYS / WEEK);
  const weeklyRestockTotal: number[] = new Array(PRODUCTS.length).fill(0);

  const oldestDay = new Date(now);
  oldestDay.setUTCDate(oldestDay.getUTCDate() - (HISTORY_DAYS - 1));
  oldestDay.setUTCHours(0, 0, 0, 0);

  for (let pi = 0; pi < PRODUCTS.length; pi++) {
    const p = PRODUCTS[pi];
    for (let w = 1; w < weekCount; w++) {
      let prevWeekSales = 0;
      for (let d = (w - 1) * WEEK; d < Math.min(w * WEEK, HISTORY_DAYS); d++) {
        prevWeekSales += dailySales[pi][d];
      }
      if (prevWeekSales <= 0) continue;
      const qty = Math.max(1, Math.round(prevWeekSales * 0.9));
      const day = new Date(oldestDay);
      day.setUTCDate(day.getUTCDate() + Math.min(w * WEEK, HISTORY_DAYS - 1));
      otherLedger.push({
        id: randomUUID(),
        businessId,
        productId: productIds[p.name],
        qtyChange: qty,
        reason: 'RESTOCK',
        note: 'Kirim dari supplier',
        createdAt: witaTime(day, 9, 0),
        createdBy: ownerId
      });
      weeklyRestockTotal[pi] += qty;
    }
  }

  // Koreksi demo (unit kecil, negatif).
  const demoAdjusts: { pi: number; dayFromNow: number; qty: number }[] = [
    { pi: 6, dayFromNow: 30, qty: -5 }, // Kerupuk Ikan Curah
    { pi: 0, dayFromNow: 55, qty: -3 }, // Amplang Tenggiri
    { pi: 5, dayFromNow: 12, qty: -4 } // Keripik Pisang
  ];
  const adjustTotal: number[] = new Array(PRODUCTS.length).fill(0);
  for (const a of demoAdjusts) {
    const p = PRODUCTS[a.pi];
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() - a.dayFromNow);
    otherLedger.push({
      id: randomUUID(),
      businessId,
      productId: productIds[p.name],
      qtyChange: a.qty,
      reason: 'ADJUST',
      note: 'opname: rusak/kedaluwarsa',
      createdAt: witaTime(day, 17, 30),
      createdBy: ownerId
    });
    adjustTotal[a.pi] += a.qty;
  }

  // Stok awal per produk (penyeimbang, di hari pertama).
  for (let pi = 0; pi < PRODUCTS.length; pi++) {
    const p = PRODUCTS[pi];
    const totalSold = dailySales[pi].reduce((s, q) => s + q, 0);
    const initial = p.stock + totalSold - weeklyRestockTotal[pi] - adjustTotal[pi];
    if (initial < 0) throw new Error(`Stok awal negatif untuk ${p.name} — kecilkan restock mingguan.`);
    if (initial === 0) continue;
    otherLedger.push({
      id: randomUUID(),
      businessId,
      productId: productIds[p.name],
      qtyChange: initial,
      reason: 'RESTOCK',
      note: 'Stok awal',
      createdAt: witaTime(oldestDay, 8, 0),
      createdBy: ownerId
    });
  }

  // -----------------------------------------------------------------------
  // Batch insert — SEBELUMNYA di sini ada `await db.insert(...)` per
  // transaksi di dalam loop di atas (2 round-trip DB x ~11.000 transaksi =
  // ~22.000 query sequential, ~15-20 menit di Neon/Supabase karena tiap
  // query kena network latency). Sekarang loop di atas cuma numpuk row ke
  // array di memory (murni JS, gak ada I/O), baru di-insert rame-rame di
  // sini per batch 500 row -> total round-trip turun ke puluhan, bukan
  // puluhan-ribu.
  // -----------------------------------------------------------------------
  function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  const BATCH_SIZE = 500;

  console.log(`Generate selesai (${totalTx} transaksi di memory). Insert ke DB per batch ${BATCH_SIZE}...`);

  for (const batch of chunk(txRows, BATCH_SIZE)) {
    await db.insert(transaction).values(batch);
  }
  for (const batch of chunk(itemRows, BATCH_SIZE)) {
    await db.insert(transactionItem).values(batch);
  }
  for (const batch of chunk(saleLedger, BATCH_SIZE)) {
    await db.insert(stockMovement).values(batch);
  }
  for (const batch of chunk(otherLedger, BATCH_SIZE)) {
    await db.insert(stockMovement).values(batch);
  }

  console.log(`Seed selesai: ${PRODUCTS.length} produk, ${totalTx} transaksi selama ${HISTORY_DAYS} hari.`);
  console.log('Login sebagai Owner: owner@test.com / password');
  console.log('Login sebagai Staff: staff@test.com / password');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .then(() => process.exit(0));

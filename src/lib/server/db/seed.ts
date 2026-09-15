import { db } from './db';
import { business, user, product, transaction, transactionItem } from './schema';
import { auth } from '../auth';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// -----------------------------------------------------------------------
// Seed data: "Resto Etam" — resto makanan khas Kalimantan, dipakai sebagai
// demo data portfolio (ganti dari draft awal "Kopi Kenangan" yang make
// nama brand asli, dan draft "Hasil Bumi Etam" yang kedagingan/kelautan/
// pertaniannya kecampur jadi gak masuk akal buat 1 usaha kecil).
//
// 10 menu ini SENGAJA dikasih variasi biar lib/analytics.ts &
// lib/simulation.ts ada "bahan" buat didemoin, bukan cuma nama doang:
//  - margin spread 40%-70%
//  - 3 tingkat volatilitas COGS (rendah/sedang/tinggi) -> bahan simulasi
//    "what-if harga bahan baku naik X%"
//  - 1 item musiman ekstrem (Bubur Pedas Sambas, spike sekitar HUT RI
//    17 Agustus, bukan Ramadan — Ramadan 2026 jatuh Feb-Mar, di luar
//    window 90 hari data ini, jadi dipakai momentum lokal yang beneran
//    match kalender)
// -----------------------------------------------------------------------

type Volatility = 'low' | 'medium' | 'high';

interface SeedProduct {
  name: string;
  costPrice: number;
  sellingPrice: number;
  qtyMin: number;
  qtyMax: number;
  volatility: Volatility;
  /** Produk musiman ekstrem: qty ~0 di luar spike window. */
  seasonalOnly?: boolean;
}

const VOLATILITY_FACTOR: Record<Volatility, number> = {
  low: 0.03,
  medium: 0.08,
  high: 0.2
};

const PRODUCTS: SeedProduct[] = [
  { name: 'Nasi Kuning Samarinda', costPrice: 7500, sellingPrice: 15000, qtyMin: 40, qtyMax: 60, volatility: 'low' },
  { name: 'Soto Banjar', costPrice: 11000, sellingPrice: 22000, qtyMin: 30, qtyMax: 45, volatility: 'low' },
  { name: 'Gence Ruan', costPrice: 20000, sellingPrice: 38000, qtyMin: 10, qtyMax: 18, volatility: 'high' },
  { name: 'Ayam Cincane', costPrice: 13500, sellingPrice: 28000, qtyMin: 20, qtyMax: 35, volatility: 'medium' },
  { name: 'Sate Payau', costPrice: 27000, sellingPrice: 45000, qtyMin: 5, qtyMax: 10, volatility: 'high' },
  { name: 'Kepiting Soka Balikpapan', costPrice: 33000, sellingPrice: 55000, qtyMin: 4, qtyMax: 9, volatility: 'high' },
  { name: 'Sayur Gangan Asam', costPrice: 4800, sellingPrice: 12000, qtyMin: 25, qtyMax: 40, volatility: 'low' },
  { name: 'Amplang', costPrice: 9000, sellingPrice: 20000, qtyMin: 8, qtyMax: 15, volatility: 'low' },
  { name: 'Es Kelapa Jelly / Es Teh Etam', costPrice: 3000, sellingPrice: 10000, qtyMin: 50, qtyMax: 80, volatility: 'medium' },
  {
    name: 'Bubur Pedas Sambas',
    costPrice: 6500,
    sellingPrice: 15000,
    qtyMin: 30,
    qtyMax: 50,
    volatility: 'low',
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

async function main() {
  console.log('Seeding Katalyst (Resto Etam) dummy data...');

  const businessId = randomUUID();
  await db.insert(business).values({ id: businessId, name: 'Resto Etam' });

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
      sellingPrice: p.sellingPrice
    });
  }

  const now = new Date();
  let totalTx = 0;

  for (let dayOffset = HISTORY_DAYS - 1; dayOffset >= 0; dayOffset--) {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() - dayOffset);
    day.setUTCHours(0, 0, 0, 0);

    const weekend = isWeekend(day);
    const spike = isSpikeWindow(day);

    for (const p of PRODUCTS) {
      let targetQty: number;

      if (p.seasonalOnly) {
        targetQty = spike ? randInt(p.qtyMin, p.qtyMax) : randInt(0, 2); // nyaris 0 di luar musim
      } else {
        targetQty = randInt(p.qtyMin, p.qtyMax);
        if (weekend) targetQty = Math.round(targetQty * 1.25); // demand resto naik pas weekend
      }

      if (targetQty <= 0) continue;

      // Pecah jadi beberapa transaksi (1-3 unit per transaksi), niru pola
      // pesanan asli, bukan 1 transaksi raksasa per produk per hari.
      let remaining = targetQty;
      while (remaining > 0) {
        const qty = Math.min(remaining, randInt(1, 3));
        remaining -= qty;

        const costAtSale = applyVolatility(p.costPrice, p.volatility);
        const hour = randInt(8, 21);
        const createdAt = new Date(day);
        createdAt.setUTCHours(hour, randInt(0, 59), 0, 0);

        const txId = randomUUID();
        const servedBy = rand() < 0.7 ? staffId : ownerId;

        await db.insert(transaction).values({
          id: txId,
          businessId,
          userId: servedBy,
          createdAt
        });

        await db.insert(transactionItem).values({
          id: randomUUID(),
          transactionId: txId,
          productId: productIds[p.name],
          quantity: qty,
          priceAtSale: p.sellingPrice,
          costAtSale
        });

        totalTx++;
      }
    }
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

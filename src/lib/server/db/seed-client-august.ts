import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import * as schema from './schema';
import { business, user, product, transaction, transactionItem, stockMovement } from './schema';
import { normalizeUsername, isValidUsername, placeholderEmail } from '../domains/invites';

// Impor historis Agustus 2026; gagal bila bisnis/username sudah ada. DB harus baru dan sudah di-push schema.
// Dikecualikan: BRASTOP BIRU (harga belum pasti) dan penjualan Cleo 3D 1500 ml qty 30 (bikin stok negatif).
// Tiap baris penjualan jadi satu transaksi (tanpa nomor DO).

const required = ['DATABASE_URL', 'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'BUSINESS_NAME'] as const;
for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} belum di-set. Cek .env.`);
}

const client = postgres(process.env.DATABASE_URL!);
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

type ProductSeed = {
  name: string;
  openingStock: number;
  costPrice: number;
  sellingPrice: number;
};

const PRODUCTS: ProductSeed[] = [
  { name: 'Beras Kura-Kura 5 kg', openingStock: 101, costPrice: 82980, sellingPrice: 86000 },
  { name: 'Beras Kura-Kura 10 kg', openingStock: 150, costPrice: 164210, sellingPrice: 168000 },
  { name: 'Beras Kura-Kura 25 kg', openingStock: 27, costPrice: 407400, sellingPrice: 412000 },
  { name: 'Beras Anak Ayam 5 kg', openingStock: 0, costPrice: 77480, sellingPrice: 80000 },
  { name: 'Beras Anak Ayam 10 kg', openingStock: 1198, costPrice: 153210, sellingPrice: 157000 },
  { name: 'Beras Anak Ayam 25 kg', openingStock: 7, costPrice: 379900, sellingPrice: 384000 },
  { name: 'Beras Telur Mas 5 kg', openingStock: 1, costPrice: 67480, sellingPrice: 77000 },
  { name: 'Beras Telur Mas 10 kg', openingStock: 3, costPrice: 144580, sellingPrice: 153000 },
  { name: 'Beras Telur Mas 25 kg', openingStock: 0, costPrice: 355000, sellingPrice: 374000 },
  { name: 'Cleo Cup', openingStock: 82, costPrice: 20700, sellingPrice: 25000 },
  { name: 'Cleo Classic SR 6 LT', openingStock: 7, costPrice: 29304, sellingPrice: 35000 },
  { name: 'Cleo Mini', openingStock: 214, costPrice: 17715, sellingPrice: 22000 },
  { name: 'Cleo 3D 330 ml', openingStock: 250, costPrice: 36430, sellingPrice: 44000 },
  { name: 'Cleo 3D 550 ml', openingStock: 191, costPrice: 42636, sellingPrice: 51000 },
  { name: 'Cleo 3D SR 550 ml', openingStock: 0, costPrice: 35297, sellingPrice: 48000 },
  { name: 'Cleo 3D 1500 ml', openingStock: 3, costPrice: 54000, sellingPrice: 56000 },
  { name: 'Cleo Galon 19 LT', openingStock: 37, costPrice: 18223, sellingPrice: 23000 },
  { name: 'Cleo Galon SE 19 LT', openingStock: 0, costPrice: 29475, sellingPrice: 36000 }
];

// Tiap baris adalah satu baris penjualan dari catatan Agustus; tanpa nomor DO,
// baris tidak digabung walaupun tanggal atau produknya sama.
const SALES: Array<{ date: string; product: string; qty: number }> = [
  { date: '2026-08-03', product: 'Beras Anak Ayam 10 kg', qty: 1195 },
  { date: '2026-08-04', product: 'Cleo 3D 550 ml', qty: 100 },
  { date: '2026-08-04', product: 'Beras Kura-Kura 5 kg', qty: 5 },
  { date: '2026-08-05', product: 'Cleo Cup', qty: 3 },
  { date: '2026-08-05', product: 'Cleo 3D 330 ml', qty: 15 },
  { date: '2026-08-06', product: 'Cleo Galon 19 LT', qty: 2 },
  // Penjualan Cleo 3D 1500 ml qty 30 sengaja dilewati sampai data stok/restock diklarifikasi.
  { date: '2026-08-06', product: 'Cleo Mini', qty: 10 },
  { date: '2026-08-06', product: 'Beras Kura-Kura 5 kg', qty: 96 },
  { date: '2026-08-06', product: 'Beras Kura-Kura 10 kg', qty: 150 },
  { date: '2026-08-06', product: 'Beras Kura-Kura 25 kg', qty: 27 },
  { date: '2026-08-11', product: 'Cleo Classic SR 6 LT', qty: 1 },
  { date: '2026-08-11', product: 'Cleo Mini', qty: 50 },
  { date: '2026-08-11', product: 'Cleo Mini', qty: 15 },
  { date: '2026-08-15', product: 'Cleo 3D 330 ml', qty: 15 },
  { date: '2026-08-19', product: 'Cleo Galon 19 LT', qty: 2 },
  { date: '2026-08-21', product: 'Cleo Classic SR 6 LT', qty: 1 },
  { date: '2026-08-21', product: 'Cleo Mini', qty: 50 },
  { date: '2026-08-24', product: 'Cleo Mini', qty: 2 },
  { date: '2026-08-24', product: 'Cleo 3D 330 ml', qty: 2 },
  { date: '2026-08-24', product: 'Beras Kura-Kura 25 kg', qty: 5 },
  { date: '2026-08-24', product: 'Beras Kura-Kura 5 kg', qty: 30 },
  { date: '2026-08-24', product: 'Beras Kura-Kura 10 kg', qty: 30 },
  { date: '2026-08-24', product: 'Beras Kura-Kura 25 kg', qty: 5 },
  { date: '2026-08-24', product: 'Beras Anak Ayam 5 kg', qty: 30 },
  { date: '2026-08-24', product: 'Beras Anak Ayam 25 kg', qty: 5 },
  { date: '2026-08-24', product: 'Beras Kura-Kura 5 kg', qty: 5 },
  { date: '2026-08-24', product: 'Beras Kura-Kura 10 kg', qty: 1 },
  { date: '2026-08-24', product: 'Beras Kura-Kura 5 kg', qty: 3 },
  { date: '2026-08-26', product: 'Cleo 3D 330 ml', qty: 10 },
  { date: '2026-08-26', product: 'Beras Kura-Kura 5 kg', qty: 10 },
  { date: '2026-08-26', product: 'Beras Kura-Kura 5 kg', qty: 5 },
  { date: '2026-08-26', product: 'Beras Anak Ayam 25 kg', qty: 5 },
  { date: '2026-08-27', product: 'Cleo 3D 330 ml', qty: 10 },
  { date: '2026-08-27', product: 'Beras Kura-Kura 25 kg', qty: 1 },
  { date: '2026-08-27', product: 'Beras Anak Ayam 10 kg', qty: 2 },
  { date: '2026-08-29', product: 'Beras Kura-Kura 10 kg', qty: 50 },
  { date: '2026-08-29', product: 'Beras Kura-Kura 25 kg', qty: 15 },
  { date: '2026-08-29', product: 'Beras Kura-Kura 25 kg', qty: 30 },
  { date: '2026-08-29', product: 'Beras Kura-Kura 5 kg', qty: 20 },
  { date: '2026-08-29', product: 'Beras Kura-Kura 10 kg', qty: 20 },
  { date: '2026-08-29', product: 'Beras Kura-Kura 25 kg', qty: 50 },
  { date: '2026-08-29', product: 'Beras Kura-Kura 5 kg', qty: 5 },
  { date: '2026-08-31', product: 'Cleo 3D 330 ml', qty: 4 },
  { date: '2026-08-31', product: 'Cleo 3D 550 ml', qty: 2 },
  { date: '2026-08-31', product: 'Cleo Galon 19 LT', qty: 2 }
];

const RESTOCKS: Array<{ date: string; product: string; qty: number }> = [
  { date: '2026-08-05', product: 'Cleo Mini', qty: 30 },
  { date: '2026-08-23', product: 'Beras Kura-Kura 5 kg', qty: 950 },
  { date: '2026-08-23', product: 'Beras Kura-Kura 10 kg', qty: 800 },
  { date: '2026-08-23', product: 'Beras Kura-Kura 25 kg', qty: 946 },
  { date: '2026-08-23', product: 'Beras Anak Ayam 5 kg', qty: 30 },
  { date: '2026-08-23', product: 'Beras Anak Ayam 10 kg', qty: 1250 },
  { date: '2026-08-23', product: 'Beras Anak Ayam 25 kg', qty: 20 }
];

function atWita(date: string, hour: number, minute: number): Date {
  return new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+08:00`);
}

function chunk<T>(rows: T[], size = 300): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
}

async function main() {
  const username = normalizeUsername(process.env.ADMIN_USERNAME!);
  if (!isValidUsername(username)) throw new Error('ADMIN_USERNAME tidak valid (3-20 karakter: huruf, angka, titik, underscore, strip).');

  const existingBusinesses = await db.select({ id: business.id }).from(business).limit(1);
  if (existingBusinesses.length) {
    throw new Error('Database sudah memiliki bisnis. Seed dibatalkan agar tidak membuat duplikasi. Gunakan database client yang masih kosong.');
  }
  const existingOwner = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, placeholderEmail(username)))
    .limit(1);
  if (existingOwner.length) throw new Error(`Username ${username} sudah terdaftar di database. Seed dibatalkan.`);

  const businessId = randomUUID();
  await db.insert(business).values({ id: businessId, name: process.env.BUSINESS_NAME!, timezone: 'Asia/Makassar' });

  const signUp = await auth.api.signUpEmail({
    body: { email: placeholderEmail(username), password: process.env.ADMIN_PASSWORD!, name: process.env.ADMIN_NAME ?? 'Kevin Kamil' }
  });
  const ownerId = signUp.user.id;
  await db.update(user).set({ role: 'OWNER', businessId, username }).where(eq(user.id, ownerId));

  const productIds: Record<string, string> = {};
  const closingStocks: Record<string, number> = {};
  for (const p of PRODUCTS) closingStocks[p.name] = p.openingStock;
  for (const row of RESTOCKS) closingStocks[row.product] += row.qty;
  for (const row of SALES) closingStocks[row.product] -= row.qty;
  for (const p of PRODUCTS) {
    if (closingStocks[p.name] < 0) throw new Error(`Stok akhir negatif untuk ${p.name}: ${closingStocks[p.name]}. Import dibatalkan.`);
  }

  for (const p of PRODUCTS) {
    const id = randomUUID();
    productIds[p.name] = id;
    await db.insert(product).values({
      id,
      businessId,
      name: p.name,
      costPrice: p.costPrice,
      sellingPrice: p.sellingPrice,
      stock: closingStocks[p.name],
      minStock: 5,
      isActive: true
    });
  }

  const txRows: Array<{ id: string; businessId: string; userId: string; cashierName: string; createdAt: Date }> = [];
  const itemRows: Array<{ id: string; transactionId: string; productId: string; quantity: number; priceAtSale: number; costAtSale: number }> = [];
  const ledgerRows: Array<{
    id: string;
    businessId: string;
    productId: string;
    qtyChange: number;
    reason: 'SALE' | 'RESTOCK';
    refTxId?: string;
    note?: string;
    createdBy: string;
    createdAt: Date;
  }> = [];

  // Stok awal dicatat sebagai RESTOCK karena enum ledger tidak punya reason OPENING.
  for (const p of PRODUCTS) {
    if (p.openingStock === 0) continue;
    ledgerRows.push({
      id: randomUUID(),
      businessId,
      productId: productIds[p.name],
      qtyChange: p.openingStock,
      reason: 'RESTOCK',
      note: 'Stok awal Agustus 2026 (data master toko)',
      createdBy: ownerId,
      createdAt: atWita('2026-08-01', 8, 0)
    });
  }

  for (const row of RESTOCKS) {
    ledgerRows.push({
      id: randomUUID(),
      businessId,
      productId: productIds[row.product],
      qtyChange: row.qty,
      reason: 'RESTOCK',
      note: 'Restock dari produsen',
      createdBy: ownerId,
      createdAt: atWita(row.date, 9, 0)
    });
  }

  SALES.forEach((row, index) => {
    const p = PRODUCTS.find((item) => item.name === row.product);
    if (!p) throw new Error(`Produk tidak ditemukan untuk penjualan: ${row.product}`);
    const txId = randomUUID();
    const createdAt = atWita(row.date, 10 + Math.floor(index / 50), index % 50);
    txRows.push({ id: txId, businessId, userId: ownerId, cashierName: process.env.ADMIN_NAME ?? 'Kevin Kamil', createdAt });
    itemRows.push({
      id: randomUUID(),
      transactionId: txId,
      productId: productIds[row.product],
      quantity: row.qty,
      priceAtSale: p.sellingPrice,
      costAtSale: p.costPrice
    });
    ledgerRows.push({
      id: randomUUID(),
      businessId,
      productId: productIds[row.product],
      qtyChange: -row.qty,
      reason: 'SALE',
      refTxId: txId,
      note: 'Penjualan historis Agustus 2026',
      createdBy: ownerId,
      createdAt
    });
  });

  for (const batch of chunk(txRows)) await db.insert(transaction).values(batch);
  for (const batch of chunk(itemRows)) await db.insert(transactionItem).values(batch);
  for (const batch of chunk(ledgerRows)) await db.insert(stockMovement).values(batch);

  console.log('Seed Agustus selesai.');
  console.log(`Bisnis: ${process.env.BUSINESS_NAME}`);
  console.log(`Owner: ${username}`);
  console.log(`Produk: ${PRODUCTS.length}`);
  console.log(`Transaksi penjualan: ${txRows.length}`);
  console.log(`Baris item transaksi: ${itemRows.length}`);
  console.log(`Pergerakan stok: ${ledgerRows.length}`);
  console.log('Dikecualikan: BRASTOP BIRU dan penjualan Cleo 3D 1500 ml qty 30.');
  console.log('Stok akhir hasil rekonsiliasi:');
  for (const p of PRODUCTS) console.log(`- ${p.name}: ${closingStocks[p.name]}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });

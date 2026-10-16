import { db } from '$lib/server/db';
import { product, stockMovement, transactionItem } from '$lib/server/db/schema';
import { runBatch } from '$lib/server/db/batch';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getOwnedProduct } from './queries';
import { parseInitialStock, parseProductFields } from './validate';

export type ProductMutationResult<T> = { ok: true; data: T } | { ok: false; code: number; for: string; message: string };

export interface CreatedProduct {
  id: string;
  name: string;
  sellingPrice: number;
  costPrice: number;
}

export async function createProduct(businessId: string, userId: string, form: FormData): Promise<ProductMutationResult<CreatedProduct>> {
  const parsed = parseProductFields(form);
  if ('error' in parsed) return { ok: false, code: 400, for: 'create', message: parsed.error };
  const initial = parseInitialStock(form);
  if ('error' in initial) return { ok: false, code: 400, for: 'create', message: initial.error };

  const id = crypto.randomUUID();
  const insertProduct = db.insert(product).values({ id, businessId, ...parsed.data, stock: initial.data });

  if (initial.data > 0) {
    // Stok awal ikut dicatat di ledger biar saldo stok bisa ditelusuri
    // dari nol (bukan muncul begitu saja).
    await runBatch([
      insertProduct,
      db.insert(stockMovement).values({
        id: crypto.randomUUID(),
        businessId,
        productId: id,
        qtyChange: initial.data,
        reason: 'RESTOCK',
        note: 'Stok awal',
        createdBy: userId
      })
    ]);
  } else {
    await insertProduct;
  }
  return { ok: true, data: { id, name: parsed.data.name, sellingPrice: parsed.data.sellingPrice, costPrice: parsed.data.costPrice } };
}

export interface UpdatedProduct {
  id: string;
  name: string;
  fields: string[];
}

export async function updateProduct(businessId: string, form: FormData): Promise<ProductMutationResult<UpdatedProduct>> {
  const id = String(form.get('id') ?? '');
  const parsed = parseProductFields(form);
  if ('error' in parsed) return { ok: false, code: 400, for: 'update', message: parsed.error };
  const old = await getOwnedProduct(id, businessId);
  if (!old) {
    return { ok: false, code: 404, for: 'update', message: 'Produk tidak ditemukan.' };
  }
  // parsed.data tidak berisi stock → stok tidak tersentuh.
  await db
    .update(product)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(product.id, id), eq(product.businessId, businessId)));
  // fields hanya label yang berubah agar meta ringan dibaca di log.
  const fields: string[] = [];
  if (parsed.data.name !== old.name) fields.push('nama');
  if (parsed.data.costPrice !== old.costPrice) fields.push('modal');
  if (parsed.data.sellingPrice !== old.sellingPrice) fields.push('jual');
  if (parsed.data.minStock !== old.minStock) fields.push('minStok');
  if (parsed.data.isActive !== old.isActive) fields.push('aktif');
  return { ok: true, data: { id, name: parsed.data.name, fields } };
}

export interface ToggledProduct {
  id: string;
  name: string;
  isActive: boolean;
}

export async function toggleProduct(businessId: string, form: FormData): Promise<ProductMutationResult<ToggledProduct>> {
  const id = String(form.get('id') ?? '');
  const isActive = form.get('isActive') === 'on';
  const existing = await getOwnedProduct(id, businessId);
  if (!existing) {
    return { ok: false, code: 404, for: 'toggle', message: 'Produk tidak ditemukan.' };
  }
  await db
    .update(product)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(product.id, id), eq(product.businessId, businessId)));
  return { ok: true, data: { id, name: existing.name, isActive } };
}

export interface DeletedProduct {
  id: string;
  name: string;
}

const SALES_HISTORY_MESSAGE = 'Produk sudah punya riwayat penjualan, nonaktifkan saja.';

export async function deleteProduct(businessId: string, form: FormData): Promise<ProductMutationResult<DeletedProduct>> {
  const id = String(form.get('id') ?? '');
  const existing = await getOwnedProduct(id, businessId);
  if (!existing) {
    return { ok: false, code: 404, for: 'delete', message: 'Produk tidak ditemukan.' };
  }

  // Riwayat penjualan (item struk atau ledger SALE/VOID_RESTORE) tidak boleh hilang.
  // Ledger RESTOCK/ADJUST milik produk yang belum pernah terjual ikut dibersihkan; kalau tidak, stok awal di ledger bikin produk salah input tak bisa dihapus karena FK.
  const [sold] = await db.select({ id: transactionItem.id }).from(transactionItem).where(eq(transactionItem.productId, id)).limit(1);
  const [moved] = await db
    .select({ id: stockMovement.id })
    .from(stockMovement)
    .where(and(eq(stockMovement.productId, id), inArray(stockMovement.reason, ['SALE', 'VOID_RESTORE'])))
    .limit(1);
  if (sold || moved) return { ok: false, code: 400, for: 'delete', message: SALES_HISTORY_MESSAGE };

  try {
    await runBatch([
      db.delete(stockMovement).where(eq(stockMovement.productId, id)),
      db.delete(product).where(and(eq(product.id, id), eq(product.businessId, businessId)))
    ]);
  } catch {
    // Ada penjualan yang masuk di sela cek dan hapus (FK menolak).
    return { ok: false, code: 400, for: 'delete', message: SALES_HISTORY_MESSAGE };
  }
  return { ok: true, data: { id, name: existing.name } };
}

export interface RestockedProduct {
  id: string;
}

export async function restockProduct(businessId: string, userId: string, form: FormData): Promise<ProductMutationResult<RestockedProduct>> {
  const id = String(form.get('id') ?? '');
  const qty = Number(form.get('qty'));
  const note = String(form.get('note') ?? '').trim() || null;
  if (!Number.isInteger(qty) || qty < 1 || qty > 100000) {
    return { ok: false, code: 400, for: 'restock', message: 'Jumlah restock harus bilangan bulat 1–100000.' };
  }
  if (!(await getOwnedProduct(id, businessId))) {
    return { ok: false, code: 404, for: 'restock', message: 'Produk tidak ditemukan.' };
  }

  await runBatch([
    // Naik di SQL (stock = stock + qty), bukan baca-hitung-tulis dari JS,
    // jadi penjualan yang masuk bersamaan tidak tertimpa.
    db
      .update(product)
      .set({ stock: sql`${product.stock} + ${qty}`, updatedAt: new Date() })
      .where(and(eq(product.id, id), eq(product.businessId, businessId))),
    db.insert(stockMovement).values({
      id: crypto.randomUUID(),
      businessId,
      productId: id,
      qtyChange: qty,
      reason: 'RESTOCK',
      note,
      createdBy: userId
    })
  ]);
  return { ok: true, data: { id } };
}

export interface AdjustedProduct {
  id: string;
}

export async function adjustProduct(businessId: string, userId: string, form: FormData): Promise<ProductMutationResult<AdjustedProduct>> {
  const id = String(form.get('id') ?? '');
  const stock = Number(form.get('stock'));
  const note = String(form.get('note') ?? '').trim();
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) {
    return { ok: false, code: 400, for: 'adjust', message: 'Stok harus bilangan bulat 0–1000000.' };
  }
  if (!note) return { ok: false, code: 400, for: 'adjust', message: 'Alasan koreksi wajib diisi.' };
  const existing = await getOwnedProduct(id, businessId);
  if (!existing) return { ok: false, code: 404, for: 'adjust', message: 'Produk tidak ditemukan.' };
  if (stock === existing.stock) return { ok: false, code: 400, for: 'adjust', message: 'Tidak ada perubahan.' };

  await runBatch([
    // Ledger diproses lebih awal: selisih dihitung di DB dari stok saat statement ini jalan, bukan dari angka yang kita baca tadi.
    // Jadi tetap benar kalau ada penjualan di sela-sela. Statement berikutnya baru set stoknya.
    db.insert(stockMovement).values({
      id: crypto.randomUUID(),
      businessId,
      productId: id,
      qtyChange: sql<number>`${stock}::integer - (select ${product.stock} from ${product} where ${product.id} = ${id})`,
      reason: 'ADJUST',
      note,
      createdBy: userId
    }),
    db
      .update(product)
      .set({ stock, updatedAt: new Date() })
      .where(and(eq(product.id, id), eq(product.businessId, businessId)))
  ]);
  return { ok: true, data: { id } };
}

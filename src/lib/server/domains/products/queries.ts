import { db } from '$lib/server/db';
import { product } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';

// STAFF boleh buka /products (lihat stok & harga), tapi semua perubahan
// data produk OWNER-only. Dicek di server — menyembunyikan tombol di UI
// saja tidak cukup karena form action bisa dipanggil langsung.
export function denyUnlessOwner(locals: App.Locals, forKey: string, message: string) {
  if (locals.user?.role !== 'OWNER') return fail(403, { for: forKey, message });
  return null;
}

export async function getOwnedProduct(id: string, businessId: string) {
  const [row] = await db
    .select({ id: product.id, stock: product.stock })
    .from(product)
    .where(and(eq(product.id, id), eq(product.businessId, businessId)));
  return row ?? null;
}

// Field produk yang boleh diubah lewat form tambah/edit. SENGAJA tanpa
// `stock`: stok cuma berubah lewat penjualan, restock, atau koreksi
// (semuanya tercatat di ledger). Dulu parser ini ikut membaca `stock`, dan
// form edit tidak mengirimnya → tiap edit nama/harga stok kereset jadi 0.
export function parseProductFields(form: FormData) {
  const name = String(form.get('name') ?? '').trim();
  const costPrice = Number(form.get('costPrice'));
  const sellingPrice = Number(form.get('sellingPrice'));
  const isActive = form.get('isActive') === 'on';
  const minRaw = form.get('minStock');
  const minStock = minRaw === null || minRaw === '' ? 5 : Number(minRaw);
  if (!name) return { error: 'Nama produk wajib diisi.' };
  if (!Number.isFinite(costPrice) || costPrice < 0) return { error: 'Harga modal harus angka ≥ 0.' };
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) return { error: 'Harga jual harus angka > 0.' };
  if (!Number.isInteger(minStock) || minStock < 0 || minStock > 100000) {
    return { error: 'Batas stok menipis harus bilangan bulat 0–100000.' };
  }
  return {
    data: { name, costPrice: Math.round(costPrice), sellingPrice: Math.round(sellingPrice), isActive, minStock }
  };
}

export function parseInitialStock(form: FormData) {
  const raw = form.get('stock');
  const stock = raw === null || raw === '' ? 0 : Number(raw);
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) {
    return { error: 'Stok awal harus bilangan bulat 0–1000000.' };
  }
  return { data: stock };
}

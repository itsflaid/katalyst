import { db } from '$lib/server/db';
import { product, stockMovement } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
// crypto.randomUUID global (bukan import 'crypto') biar jalan di Workers.
// Node 19+ dan semua browser modern juga menyediakannya.
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const businessId = locals.user!.businessId as string;
  const products = await db.select().from(product).where(eq(product.businessId, businessId));
  return { products };
};

function parseProductInput(form: FormData) {
  const name = String(form.get('name') ?? '').trim();
  const costPrice = Number(form.get('costPrice'));
  const sellingPrice = Number(form.get('sellingPrice'));
  const stockRaw = form.get('stock');
  const stock = stockRaw === null || stockRaw === '' ? 0 : Number(stockRaw);
  const isActive = form.get('isActive') === 'on';
  if (!name) return { error: 'Nama produk wajib diisi.' };
  if (!Number.isFinite(costPrice) || costPrice < 0) return { error: 'Harga modal harus angka ≥ 0.' };
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) return { error: 'Harga jual harus angka > 0.' };
  if (!Number.isInteger(stock) || stock < 0) return { error: 'Stok awal harus bilangan bulat ≥ 0.' };
  return { data: { name, costPrice: Math.round(costPrice), sellingPrice: Math.round(sellingPrice), stock, isActive } };
}

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const businessId = locals.user!.businessId as string;
    const parsed = parseProductInput(await request.formData());
    if ('error' in parsed) return fail(400, { for: 'create', message: parsed.error });
    // Stok awal 0 → langsung nonaktif (aturan habis = nonaktif).
    const isActive = parsed.data.stock > 0 ? parsed.data.isActive : false;
    await db.insert(product).values({ id: crypto.randomUUID(), businessId, ...parsed.data, isActive });
    return { success: true };
  },

  update: async ({ request, locals }) => {
    const businessId = locals.user!.businessId as string;
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const parsed = parseProductInput(form);
    if ('error' in parsed) return fail(400, { for: 'update', message: parsed.error });
    const [existing] = await db
      .select({ id: product.id })
      .from(product)
      .where(and(eq(product.id, id), eq(product.businessId, businessId)));
    if (!existing) return fail(404, { for: 'update', message: 'Produk tidak ditemukan.' });
    await db
      .update(product)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(product.id, id));
    return { success: true };
  },

  toggle: async ({ request, locals }) => {
    const businessId = locals.user!.businessId as string;
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const isActive = form.get('isActive') === 'on';
    const [existing] = await db
      .select({ id: product.id })
      .from(product)
      .where(and(eq(product.id, id), eq(product.businessId, businessId)));
    if (!existing) return fail(404, { message: 'Produk tidak ditemukan.' });
    await db
      .update(product)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(product.id, id));
    return { success: true };
  },

  delete: async ({ request, locals }) => {
    const businessId = locals.user!.businessId as string;
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const [existing] = await db
      .select({ id: product.id })
      .from(product)
      .where(and(eq(product.id, id), eq(product.businessId, businessId)));
    if (!existing) return fail(404, { message: 'Produk tidak ditemukan.' });
    try {
      await db.delete(product).where(eq(product.id, id));
    } catch {
      // product masih direferensikan transaction_item (tanpa cascade)
      return fail(400, { message: 'Produk sudah punya riwayat transaksi — nonaktifkan saja.' });
    }
    return { success: true };
  },

  // Tambah stok (restock). OWNER-only. Stok > 0 otomatis mengaktifkan lagi.
  restock: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'OWNER') {
      return fail(403, { for: 'restock', message: 'Cuma Owner yang bisa restock.' });
    }
    const businessId = locals.user.businessId as string;
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const qty = Number(form.get('qty'));
    const note = String(form.get('note') ?? '').trim() || null;
    if (!Number.isInteger(qty) || qty < 1 || qty > 100000) {
      return fail(400, { for: 'restock', message: 'Jumlah restock harus bilangan bulat 1–100000.' });
    }
    const [existing] = await db
      .select({ id: product.id, stock: product.stock })
      .from(product)
      .where(and(eq(product.id, id), eq(product.businessId, businessId)));
    if (!existing) return fail(404, { for: 'restock', message: 'Produk tidak ditemukan.' });
    const newStock = existing.stock + qty;
    await db
      .update(product)
      .set({ stock: newStock, isActive: true, updatedAt: new Date() })
      .where(eq(product.id, id));
    await db.insert(stockMovement).values({
      id: crypto.randomUUID(),
      businessId,
      productId: id,
      qtyChange: qty,
      reason: 'RESTOCK',
      note,
      createdBy: locals.user.id as string
    });
    return { success: true };
  },

  // Koreksi stok hasil opname. OWNER-only, alasan wajib biar teraudit.
  adjust: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'OWNER') {
      return fail(403, { for: 'adjust', message: 'Cuma Owner yang bisa koreksi stok.' });
    }
    const businessId = locals.user.businessId as string;
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const stock = Number(form.get('stock'));
    const note = String(form.get('note') ?? '').trim();
    if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) {
      return fail(400, { for: 'adjust', message: 'Stok harus bilangan bulat 0–1000000.' });
    }
    if (!note) return fail(400, { for: 'adjust', message: 'Alasan koreksi wajib diisi.' });
    const [existing] = await db
      .select({ id: product.id, stock: product.stock, isActive: product.isActive })
      .from(product)
      .where(and(eq(product.id, id), eq(product.businessId, businessId)));
    if (!existing) return fail(404, { for: 'adjust', message: 'Produk tidak ditemukan.' });
    const diff = stock - existing.stock;
    if (diff === 0) return fail(400, { for: 'adjust', message: 'Tidak ada perubahan.' });
    await db
      .update(product)
      .set({
        stock,
        isActive: stock <= 0 ? false : existing.stock <= 0 ? true : existing.isActive,
        updatedAt: new Date()
      })
      .where(eq(product.id, id));
    await db.insert(stockMovement).values({
      id: crypto.randomUUID(),
      businessId,
      productId: id,
      qtyChange: diff,
      reason: 'ADJUST',
      note,
      createdBy: locals.user.id as string
    });
    return { success: true };
  }
};

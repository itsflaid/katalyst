import { db } from '$lib/server/db';
import { product } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { randomUUID } from 'crypto';
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
  const isActive = form.get('isActive') === 'on';
  if (!name) return { error: 'Nama produk wajib diisi.' };
  if (!Number.isFinite(costPrice) || costPrice < 0) return { error: 'Harga modal harus angka ≥ 0.' };
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) return { error: 'Harga jual harus angka > 0.' };
  return { data: { name, costPrice: Math.round(costPrice), sellingPrice: Math.round(sellingPrice), isActive } };
}

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const businessId = locals.user!.businessId as string;
    const parsed = parseProductInput(await request.formData());
    if ('error' in parsed) return fail(400, { for: 'create', message: parsed.error });
    await db.insert(product).values({ id: randomUUID(), businessId, ...parsed.data });
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
  }
};

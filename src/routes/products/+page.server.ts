import {
  adjustProduct,
  createProduct,
  deleteProduct,
  listProducts,
  restockProduct,
  toggleProduct,
  updateProduct
} from '$lib/server/domains/products';
import { requireOwner, requireTenant } from '$lib/server/domains/auth/guards';
import { actorOf, netOf, recordActivity } from '$lib/server/domains/activity/log';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { businessId, role } = requireTenant(locals);
  const products = await listProducts(businessId);
  // role ikut dikirim biar UI bisa menyembunyikan aksi yang memang ditolak server.
  return { products, role };
};

export const actions: Actions = {
  create: async ({ request, locals, getClientAddress }) => {
    const { businessId, userId, user: actor } = requireOwner(locals);

    const result = await createProduct(businessId, userId, await request.formData());
    if (!result.ok) return fail(result.code, { for: result.for, message: result.message });
    await recordActivity({
      businessId,
      actor: actorOf(actor),
      ...netOf({ request, getClientAddress }),
      action: 'PRODUCT_CREATE',
      entityType: 'product',
      entityId: result.data.id,
      meta: { name: result.data.name, sellingPrice: result.data.sellingPrice, costPrice: result.data.costPrice }
    });
    return { success: true };
  },

  update: async ({ request, locals, getClientAddress }) => {
    const { businessId, user: actor } = requireOwner(locals);

    const result = await updateProduct(businessId, await request.formData());
    if (!result.ok) return fail(result.code, { for: result.for, message: result.message });
    await recordActivity({
      businessId,
      actor: actorOf(actor),
      ...netOf({ request, getClientAddress }),
      action: 'PRODUCT_UPDATE',
      entityType: 'product',
      entityId: result.data.id,
      meta: { name: result.data.name, fields: result.data.fields }
    });
    return { success: true };
  },

  // isActive itu pilihan owner (jual / tidak dijual). Tidak ada hubungan
  // dengan stok: produk stok 0 tetap "aktif" tapi otomatis tersembunyi di
  // kasir dan berlabel Habis.
  toggle: async ({ request, locals, getClientAddress }) => {
    const { businessId, user: actor } = requireOwner(locals);

    const result = await toggleProduct(businessId, await request.formData());
    if (!result.ok) return fail(result.code, { for: result.for, message: result.message });
    await recordActivity({
      businessId,
      actor: actorOf(actor),
      ...netOf({ request, getClientAddress }),
      action: 'PRODUCT_TOGGLE',
      entityType: 'product',
      entityId: result.data.id,
      meta: { name: result.data.name, isActive: result.data.isActive }
    });
    return { success: true };
  },

  delete: async ({ request, locals, getClientAddress }) => {
    const { businessId, user: actor } = requireOwner(locals);

    const result = await deleteProduct(businessId, await request.formData());
    if (!result.ok) return fail(result.code, { for: result.for, message: result.message });
    await recordActivity({
      businessId,
      actor: actorOf(actor),
      ...netOf({ request, getClientAddress }),
      action: 'PRODUCT_DELETE',
      entityType: 'product',
      entityId: result.data.id,
      meta: { name: result.data.name }
    });
    return { success: true };
  },

  // Tambah stok (restock). OWNER-only. Tidak mengubah isActive.
  restock: async ({ request, locals }) => {
    const { businessId, userId } = requireOwner(locals);

    const result = await restockProduct(businessId, userId, await request.formData());
    if (!result.ok) return fail(result.code, { for: result.for, message: result.message });
    return { success: true };
  },

  // Koreksi stok hasil opname. OWNER-only, alasan wajib biar teraudit.
  adjust: async ({ request, locals }) => {
    const { businessId, userId } = requireOwner(locals);

    const result = await adjustProduct(businessId, userId, await request.formData());
    if (!result.ok) return fail(result.code, { for: result.for, message: result.message });
    return { success: true };
  }
};

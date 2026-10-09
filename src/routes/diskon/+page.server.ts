import { db } from '$lib/server/db';
import { discount, product } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { requireOwner } from '$lib/server/domains/auth/guards';
import { denyUnlessOwner } from '$lib/server/domains/products';
import { canDeleteDiscount, findOverlap, listDiscounts, overlapDbMessage, parseDiscountForm } from '$lib/server/domains/discounts';
import { getDiscountStatus } from '$lib/discount';
import { DEFAULT_TZ, makeTime } from '$lib/shared/time';
import type { Actions, PageServerLoad } from './$types';

// Tab: aktif (ACTIVE) | terjadwal (SCHEDULED) | selesai (EXPIRED + SOLD_OUT + INACTIVE).
const TABS = ['aktif', 'terjadwal', 'selesai'] as const;
type Tab = (typeof TABS)[number];

export const load: PageServerLoad = async ({ locals, url }) => {
  requireOwner(locals);
  const businessId = locals.user!.businessId as string;
  const tz = locals.business?.timezone ?? DEFAULT_TZ;
  const now = new Date();

  const raws = await listDiscounts(businessId);
  const discounts = raws.map((d) => ({
    ...d,
    status: getDiscountStatus(
      {
        id: d.id,
        name: d.name,
        scope: d.scope,
        percent: d.percent,
        productId: d.productId,
        isActive: d.isActive,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        quota: d.quota,
        quotaUsed: d.quotaUsed,
        createdAt: d.createdAt
      },
      now
    ),
    // Timestamp sebagai ISO string (aman lewat devalue ke client).
    startsAt: d.startsAt.toISOString(),
    endsAt: d.endsAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString()
  }));

  const tab: Tab = (TABS as readonly string[]).includes(url.searchParams.get('tab') ?? '')
    ? (url.searchParams.get('tab') as Tab)
    : 'aktif';
  const counts = {
    aktif: discounts.filter((d) => d.status === 'ACTIVE').length,
    terjadwal: discounts.filter((d) => d.status === 'SCHEDULED').length,
    selesai: discounts.filter((d) => ['EXPIRED', 'SOLD_OUT', 'INACTIVE'].includes(d.status)).length
  };

  const products = await db
    .select({
      id: product.id,
      name: product.name,
      sellingPrice: product.sellingPrice,
      costPrice: product.costPrice,
      isActive: product.isActive
    })
    .from(product)
    .where(eq(product.businessId, businessId));

  return { discounts, tab, counts, products, timezone: tz };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const denied = denyUnlessOwner(locals, 'create', 'Cuma Owner yang bisa menambah diskon.');
    if (denied) return denied;
    const businessId = locals.user!.businessId as string;
    const T = makeTime(locals.business?.timezone ?? DEFAULT_TZ);
    const form = await request.formData();
    const parsed = await parseDiscountForm(form, { businessId, now: new Date(), T });
    if ('error' in parsed) return fail(400, { message: parsed.error, code: parsed.code, lossProducts: parsed.lossProducts });

    // crypto.randomUUID global (bukan import 'crypto') biar jalan di Workers.
    try {
      await db.insert(discount).values({
        id: crypto.randomUUID(),
        businessId,
        name: parsed.data.name,
        scope: parsed.data.scope,
        percent: parsed.data.percent,
        productId: parsed.data.productId,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
        quota: parsed.data.quota
      });
    } catch (e) {
      // Balapan dengan diskon lain di sela cek aplikasi: constraint DB yang menolak.
      const message = overlapDbMessage(e, null);
      if (message) return fail(400, { message });
      throw e;
    }
    return { success: true };
  },

  update: async ({ request, locals }) => {
    const denied = denyUnlessOwner(locals, 'update', 'Cuma Owner yang bisa mengubah diskon.');
    if (denied) return denied;
    const businessId = locals.user!.businessId as string;
    const T = makeTime(locals.business?.timezone ?? DEFAULT_TZ);
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const [existing] = await db
      .select()
      .from(discount)
      .where(and(eq(discount.id, id), eq(discount.businessId, businessId)));
    if (!existing) return fail(404, { message: 'Diskon tidak ditemukan.' });

    const parsed = await parseDiscountForm(form, { businessId, now: new Date(), T, existing });
    if ('error' in parsed) return fail(400, { message: parsed.error, code: parsed.code, lossProducts: parsed.lossProducts });

    // Scope & produk tak tersentuh (divalidasi di parse); saklar via toggle.
    try {
      await db
        .update(discount)
        .set({
          name: parsed.data.name,
          percent: parsed.data.percent,
          startsAt: parsed.data.startsAt,
          endsAt: parsed.data.endsAt,
          quota: parsed.data.quota
        })
        .where(and(eq(discount.id, id), eq(discount.businessId, businessId)));
    } catch (e) {
      // Balapan dengan diskon lain di sela cek aplikasi: constraint DB yang menolak.
      const message = overlapDbMessage(e, null);
      if (message) return fail(400, { message });
      throw e;
    }
    return { success: true };
  },

  toggle: async ({ request, locals }) => {
    const denied = denyUnlessOwner(locals, 'toggle', 'Cuma Owner yang bisa mengubah status diskon.');
    if (denied) return denied;
    const businessId = locals.user!.businessId as string;
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const [existing] = await db
      .select()
      .from(discount)
      .where(and(eq(discount.id, id), eq(discount.businessId, businessId)));
    if (!existing) return fail(404, { message: 'Diskon tidak ditemukan.' });

    // Menyalakan kembali dicek overlap ulang (rentang lain bisa muncul
    // saat diskon ini nonaktif).
    if (!existing.isActive && existing.scope === 'PRODUCT' && existing.productId) {
      const clash = await findOverlap(businessId, existing.productId, existing.startsAt, existing.endsAt, existing.id);
      if (clash.length > 0) {
        return fail(400, { message: `Rentang waktu bertabrakan dengan diskon "${clash[0].name}".` });
      }
    }
    try {
      await db
        .update(discount)
        .set({ isActive: !existing.isActive })
        .where(and(eq(discount.id, id), eq(discount.businessId, businessId)));
    } catch (e) {
      // Balapan dengan diskon lain di sela cek aplikasi: constraint DB yang menolak.
      const message = overlapDbMessage(e, null);
      if (message) return fail(400, { message });
      throw e;
    }
    return { success: true };
  },

  delete: async ({ request, locals }) => {
    const denied = denyUnlessOwner(locals, 'delete', 'Cuma Owner yang bisa menghapus diskon.');
    if (denied) return denied;
    const businessId = locals.user!.businessId as string;
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const checked = await canDeleteDiscount(id, businessId);
    if ('error' in checked) return fail(400, { message: checked.error });
    try {
      await db.delete(discount).where(and(eq(discount.id, id), eq(discount.businessId, businessId)));
    } catch {
      // Baris item menunjuk diskon lewat FK SET NULL: hapus tidak ditolak walau sudah dipakai.
      // Penjaganya canDeleteDiscount di atas (quotaUsed > 0); tangkapan ini menyamakan pesan bila DB gagal di sela.
      return fail(400, { message: 'Sudah dipakai di transaksi — nonaktifkan saja.' });
    }
    return { success: true };
  }
};

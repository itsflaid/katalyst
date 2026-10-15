import { db } from '$lib/server/db';
import { discount } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import type { BizTime } from '$lib/shared/time';
import { overlapDbMessage } from './errors';
import { canDeleteDiscount, findOverlap } from './queries';
import { parseDiscountForm } from './validate';

export type DiscountMutationResult<T> = { ok: true; data: T } | { ok: false; code: number; message: string; errorCode?: string; lossProducts?: { id: string; name: string }[] };

function parseFailure(parsed: { error: string; code?: string; lossProducts?: { id: string; name: string }[] }): Extract<DiscountMutationResult<never>, { ok: false }> {
  return { ok: false, code: 400, message: parsed.error, errorCode: parsed.code, lossProducts: parsed.lossProducts };
}

export interface CreatedDiscount {
  id: string;
  name: string;
  percent: number;
  scope: string;
}

export async function createDiscount(businessId: string, form: FormData, now: Date, T: BizTime): Promise<DiscountMutationResult<CreatedDiscount>> {
  const parsed = await parseDiscountForm(form, { businessId, now, T });
  if ('error' in parsed) return parseFailure(parsed);

  const discountId = crypto.randomUUID();
  try {
    await db.insert(discount).values({
      id: discountId,
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
    if (message) return { ok: false, code: 400, message };
    throw e;
  }
  return { ok: true, data: { id: discountId, name: parsed.data.name, percent: parsed.data.percent, scope: parsed.data.scope } };
}

export interface UpdatedDiscount {
  id: string;
  name: string;
  percent: number;
}

export async function updateDiscount(
  businessId: string,
  id: string,
  form: FormData,
  now: Date,
  T: BizTime
): Promise<DiscountMutationResult<UpdatedDiscount>> {
  const [existing] = await db
    .select()
    .from(discount)
    .where(and(eq(discount.id, id), eq(discount.businessId, businessId)));
  if (!existing) return { ok: false, code: 404, message: 'Diskon tidak ditemukan.' };

  const parsed = await parseDiscountForm(form, { businessId, now, T, existing });
  if ('error' in parsed) return parseFailure(parsed);

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
    if (message) return { ok: false, code: 400, message };
    throw e;
  }
  return { ok: true, data: { id, name: parsed.data.name, percent: parsed.data.percent } };
}

export interface ToggledDiscount {
  id: string;
  name: string;
  isActive: boolean;
}

export async function toggleDiscount(businessId: string, id: string): Promise<DiscountMutationResult<ToggledDiscount>> {
  const [existing] = await db
    .select()
    .from(discount)
    .where(and(eq(discount.id, id), eq(discount.businessId, businessId)));
  if (!existing) return { ok: false, code: 404, message: 'Diskon tidak ditemukan.' };

  // Menyalakan kembali dicek overlap ulang (rentang lain bisa muncul
  // saat diskon ini nonaktif).
  if (!existing.isActive && existing.scope === 'PRODUCT' && existing.productId) {
    const clash = await findOverlap(businessId, existing.productId, existing.startsAt, existing.endsAt, existing.id);
    if (clash.length > 0) {
      return { ok: false, code: 400, message: `Rentang waktu bertabrakan dengan diskon "${clash[0].name}".` };
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
    if (message) return { ok: false, code: 400, message };
    throw e;
  }
  return { ok: true, data: { id, name: existing.name, isActive: !existing.isActive } };
}

export interface DeletedDiscount {
  id: string;
  name: string | null;
}

export async function deleteDiscount(businessId: string, id: string): Promise<DiscountMutationResult<DeletedDiscount>> {
  const checked = await canDeleteDiscount(id, businessId);
  if ('error' in checked) return { ok: false, code: 400, message: checked.error };
  // Nama diambil sebelum hapus untuk meta log; baris diskon hilang setelah ini.
  const [doomed] = await db
    .select({ name: discount.name })
    .from(discount)
    .where(and(eq(discount.id, id), eq(discount.businessId, businessId)));
  try {
    await db.delete(discount).where(and(eq(discount.id, id), eq(discount.businessId, businessId)));
  } catch {
    // Baris item menunjuk diskon lewat FK SET NULL: hapus tidak ditolak walau sudah dipakai.
    // Penjaganya canDeleteDiscount di atas (quotaUsed > 0); tangkapan ini menyamakan pesan bila DB gagal di sela.
    return { ok: false, code: 400, message: 'Sudah dipakai di transaksi, nonaktifkan saja.' };
  }
  return { ok: true, data: { id, name: doomed?.name ?? null } };
}

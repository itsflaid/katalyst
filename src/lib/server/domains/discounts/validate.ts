import { db } from '$lib/server/db';
import { discount, product } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { isBelowCost, resolveWindow, type DiscountScope, type WindowPreset } from '$lib/discount';
import type { BizTime } from '$lib/shared/time';
import { findOverlap } from './queries';

export interface ExistingDiscount {
  id: string;
  scope: DiscountScope;
  productId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  quotaUsed: number;
}

export interface DiscountFormCtx {
  businessId: string;
  now: Date;
  T: BizTime;
  existing?: ExistingDiscount;
}

export interface ParsedDiscountForm {
  name: string;
  scope: DiscountScope;
  percent: number;
  productId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  quota: number | null;
}

export type DiscountFormResult =
  | { data: ParsedDiscountForm }
  | { error: string; code?: string; lossProducts?: { id: string; name: string }[] };

const PRESETS: WindowPreset[] = ['TODAY', 'DAYS_2', 'DAYS_7', 'CUSTOM', 'OPEN'];

// Validasi form tambah/edit diskon. Aturan lengkap di SPEC Fase 4.1:
// nama 1–60, persen 1–100, scope tetap saat update, GLOBAL wajib endsAt +
// tanpa kuota, kuota 1–1jt & ≥ terpakai, overlap PRODUCT, guard rugi.
export async function parseDiscountForm(form: FormData, ctx: DiscountFormCtx): Promise<DiscountFormResult> {
  const { businessId, now, T, existing } = ctx;

  const name = String(form.get('name') ?? '').trim();
  if (name.length < 1 || name.length > 60) return { error: 'Nama diskon 1–60 karakter.' };

  const percentRaw = String(form.get('percent') ?? '').trim();
  const percent = Number(percentRaw);
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
    return { error: 'Persen diskon harus bilangan bulat 1–100.' };
  }

  const scope = String(form.get('scope') ?? '') as DiscountScope;
  if (scope !== 'PRODUCT' && scope !== 'GLOBAL') return { error: 'Cakupan tidak valid.' };
  // Scope dan produk tidak bisa diubah saat update (menghindari histori
  // kuota tercampur antar produk/tipe).
  if (existing && scope !== existing.scope) {
    return { error: 'Cakupan diskon tidak bisa diubah. Buat diskon baru.' };
  }

  let productId: string | null = null;
  if (scope === 'PRODUCT') {
    const rawPid = String(form.get('productId') ?? '').trim();
    if (!rawPid) return { error: 'Pilih produk untuk diskon produk.' };
    if (existing && rawPid !== existing.productId) {
      return { error: 'Produk diskon tidak bisa diubah. Buat diskon baru.' };
    }
    const [p] = await db
      .select({ id: product.id, sellingPrice: product.sellingPrice, costPrice: product.costPrice })
      .from(product)
      .where(and(eq(product.id, rawPid), eq(product.businessId, businessId)));
    if (!p) return { error: 'Produk tidak ditemukan.' };
    productId = p.id;
  } else {
    const rawPid = String(form.get('productId') ?? '').trim();
    if (rawPid) return { error: 'Diskon global tidak terikat produk.' };
  }

  const preset = String(form.get('preset') ?? '') as WindowPreset;
  if (!PRESETS.includes(preset)) return { error: 'Preset waktu tidak valid.' };
  const window = resolveWindow(preset, now, T, {
    startDay: String(form.get('startDay') ?? '').trim() || undefined,
    endDay: String(form.get('endDay') ?? '').trim() || undefined
  });
  if ('error' in window) return { error: window.error };

  // startsAt yang sudah lewat tidak diubah (diskon berjalan waktunya tetap).
  const startsAt = existing && existing.startsAt <= now ? existing.startsAt : window.startsAt;
  // endsAt boleh diperpanjang/dipersingkat, tapi harus > startsAt.
  const endsAt = window.endsAt;
  if (endsAt !== null && endsAt <= startsAt) {
    return { error: 'Waktu berakhir harus setelah waktu mulai.' };
  }

  // GLOBAL wajib berbatas waktu dan tanpa kuota unit (aturan DB juga).
  if (scope === 'GLOBAL') {
    if (endsAt === null) return { error: 'Diskon global wajib ada batas waktu.' };
    const quotaRaw = String(form.get('quota') ?? '').trim();
    if (quotaRaw !== '') return { error: 'Diskon global tidak memakai kuota.' };
  }

  let quota: number | null = null;
  if (scope === 'PRODUCT') {
    const quotaRaw = String(form.get('quota') ?? '').trim();
    if (quotaRaw !== '') {
      const q = Number(quotaRaw);
      if (!Number.isInteger(q) || q < 1 || q > 1000000) {
        return { error: 'Kuota harus bilangan bulat 1–1000000 (unit).' };
      }
      if (existing && q < existing.quotaUsed) {
        return { error: `Kuota tidak boleh di bawah yang sudah terpakai (${existing.quotaUsed}).` };
      }
      quota = q;
    }
  }

  // Rentang PRODUCT aktif lain di produk sama tidak boleh overlap
  // (divalidasi di action; abaikan diri sendiri saat update).
  if (scope === 'PRODUCT' && productId) {
    const clash = await findOverlap(businessId, productId, startsAt, endsAt, existing?.id);
    if (clash.length > 0) {
      return { error: `Rentang waktu bertabrakan dengan diskon "${clash[0].name}".` };
    }
  }

  // Guard rugi = peringatan + konfirmasi, bukan blok keras.
  const confirmLoss = form.get('confirmLoss') === 'on';
  if (!confirmLoss) {
    const lossProducts: { id: string; name: string }[] = [];
    if (scope === 'PRODUCT' && productId) {
      const [p] = await db
        .select({ id: product.id, name: product.name, sellingPrice: product.sellingPrice, costPrice: product.costPrice })
        .from(product)
        .where(and(eq(product.id, productId), eq(product.businessId, businessId)));
      if (p && isBelowCost(p.sellingPrice, p.costPrice, percent)) {
        lossProducts.push({ id: p.id, name: p.name });
      }
    } else if (scope === 'GLOBAL') {
      const prods = await db
        .select({ id: product.id, name: product.name, sellingPrice: product.sellingPrice, costPrice: product.costPrice })
        .from(product)
        .where(and(eq(product.businessId, businessId), eq(product.isActive, true)));
      for (const p of prods) {
        if (isBelowCost(p.sellingPrice, p.costPrice, percent)) lossProducts.push({ id: p.id, name: p.name });
      }
    }
    if (lossProducts.length > 0) {
      const names = lossProducts.map((p) => p.name).join(', ');
      return {
        error: `Diskon ${percent}% membuat harga di bawah modal: ${names}.`,
        code: 'BELOW_COST',
        lossProducts
      };
    }
  }

  return { data: { name, scope, percent, productId, startsAt, endsAt, quota } };
}

// Dipakai aksi hapus: hanya boleh bila belum pernah dipakai di transaksi.
export async function canDeleteDiscount(id: string, businessId: string) {
  const [row] = await db
    .select({ id: discount.id, quotaUsed: discount.quotaUsed })
    .from(discount)
    .where(and(eq(discount.id, id), eq(discount.businessId, businessId)));
  if (!row) return { error: 'Diskon tidak ditemukan.' };
  if (row.quotaUsed > 0) return { error: 'Sudah dipakai di transaksi — nonaktifkan saja.' };
  return { data: row };
}

import { db } from '$lib/server/db';
import { activityLog, discount, product, stockMovement, transaction, transactionItem } from '$lib/server/db/schema';
import { runBatch } from '$lib/server/db/batch';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { calculateCart, getDiscountStatus, quotaDeltas } from '$lib/shared/discount';
import { fmtRupiah } from '$lib/shared/format';
import { receiptTotals } from '$lib/analytics';
import { INT4_MAX } from '$lib/server/domains/products';
import { activityRow } from '$lib/server/domains/activity/log';
import { getActiveProductDiscounts, getGlobalDiscount } from '$lib/server/domains/discounts';
import type { Role } from '$lib/server/domains/auth/guards';
import { checkViolationName } from './errors';

export interface CheckoutInput {
  businessId: string;
  userId: string;
  role: Role;
  cashierName: string | null;
  itemsRaw: unknown;
  globalDiscountIdRaw: unknown;
  expectedTotalRaw: unknown;
  now: Date;
  net: { ip: string | null; userAgent: string | null };
}

export type CheckoutResult =
  { ok: true; data: { txId: string } } | { ok: false; code: number; message: string; errorCode?: string; newTotal?: number };

export async function checkoutCart(input: CheckoutInput): Promise<CheckoutResult> {
  const { businessId, userId, role, cashierName, now, net } = input;
  const fail = (code: number, message: string, extra?: { errorCode?: string; newTotal?: number }): CheckoutResult => ({
    ok: false,
    code,
    message,
    ...extra
  });

  let rawItems: unknown;
  try {
    rawItems = JSON.parse(String(input.itemsRaw ?? '[]'));
  } catch {
    return fail(400, 'Format keranjang tidak valid.');
  }
  // Diskon global pilihan kasir (opsional) + total harapan dari preview
  // client untuk deteksi harga berubah.
  const globalDiscountIdRaw = String(input.globalDiscountIdRaw ?? '').trim();
  const globalDiscountId = globalDiscountIdRaw === '' ? null : globalDiscountIdRaw;
  // expectedTotal yang hilang/kosong berarti klien lama atau cacat → tolak.
  // Jangan anggap 0: total 0 yang sah (mis. diskon 100%) lolos via '0' eksplisit.
  const expectedRaw = input.expectedTotalRaw;
  const expectedTotal = expectedRaw === null || String(expectedRaw ?? '').trim() === '' ? NaN : Number(expectedRaw);
  if (!Number.isInteger(expectedTotal) || expectedTotal < 0) {
    return fail(400, 'Total harapan tidak valid.');
  }
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return fail(400, 'Keranjang masih kosong.');
  }
  if (rawItems.length > 50) return fail(400, 'Maksimal 50 jenis produk per struk.');

  // Gabungkan duplikat productId + validasi qty integer 1..1000.
  const merged = new Map<string, number>();
  for (const it of rawItems as Array<{ productId?: unknown; qty?: unknown }>) {
    const productId = typeof it?.productId === 'string' ? it.productId : '';
    const qty = typeof it?.qty === 'number' ? it.qty : Number(it?.qty);
    if (!productId) return fail(400, 'Ada produk tanpa id.');
    if (!Number.isInteger(qty) || qty < 1 || qty > 1000) {
      return fail(400, 'Qty harus bilangan bulat 1–1000.');
    }
    merged.set(productId, (merged.get(productId) ?? 0) + qty);
  }
  const productIds = Array.from(merged.keys());

  // Harga tidak dipercaya dari client, ambil fresh dari DB + pastikan
  // produk aktif milik bisnis ini.
  const dbProducts = await db
    .select({
      id: product.id,
      name: product.name,
      sellingPrice: product.sellingPrice,
      costPrice: product.costPrice,
      stock: product.stock,
      isActive: product.isActive
    })
    .from(product)
    .where(and(eq(product.businessId, businessId), inArray(product.id, productIds)));

  if (dbProducts.length !== productIds.length) {
    return fail(400, 'Ada produk yang tidak ditemukan.');
  }
  const inactive = dbProducts.find((p) => !p.isActive);
  if (inactive) return fail(400, 'Ada produk nonaktif di keranjang.');
  // Tolak seluruh struk kalau satu item pun stoknya kurang, jangan simpan sebagian sebelum kasir betulkan.
  const short = dbProducts.find((p) => merged.get(p.id)! > p.stock);
  if (short) return fail(400, `Stok ${short.name} kurang (sisa ${short.stock}).`);
  // discountAmount per baris bertipe int4: qty × harga yang lewat batas bikin batch gagal di DB.
  const tooBig = dbProducts.find((p) => merged.get(p.id)! * p.sellingPrice > INT4_MAX);
  if (tooBig) return fail(400, `Nilai ${tooBig.name} terlalu besar untuk satu struk, kurangi jumlahnya.`);

  const byId = new Map(dbProducts.map((p) => [p.id, p]));

  // Ambil diskon produk ACTIVE + global pilihan (harga tetap dari DB).
  const productDiscounts = await getActiveProductDiscounts(businessId, productIds, now);
  let global: Awaited<ReturnType<typeof getGlobalDiscount>> | null = null;
  if (globalDiscountId) {
    global = await getGlobalDiscount(businessId, globalDiscountId);
    if (!global || global.scope !== 'GLOBAL' || getDiscountStatus({ ...global, scope: 'GLOBAL' }, now) !== 'ACTIVE') {
      return fail(
        409,
        global
          ? `Diskon "${global.name}" sudah tidak berlaku. Muat ulang lalu coba lagi.`
          : 'Diskon global tidak ditemukan. Muat ulang lalu coba lagi.',
        {
          errorCode: 'DISCOUNT_UNAVAILABLE'
        }
      );
    }
  }

  // Hitung ulang semua diskon pakai jam server; client mengirim expectedTotal.
  const cart = calculateCart(
    productIds.map((pid) => ({ productId: pid, qty: merged.get(pid)!, price: byId.get(pid)!.sellingPrice })),
    {
      productDiscounts: productDiscounts.map((d) => ({ ...d, scope: 'PRODUCT' as const })),
      global: global ? { ...global, scope: 'GLOBAL' as const } : null,
      now
    }
  );
  if (cart.total !== expectedTotal) {
    return fail(409, `Harga berubah, total sekarang ${fmtRupiah(cart.total)}. Periksa keranjang lalu catat ulang.`, {
      errorCode: 'PRICE_CHANGED',
      newTotal: cart.total
    });
  }
  const lineByPid = new Map(cart.lines.map((l) => [l.productId, l]));
  const deltas = quotaDeltas(cart);

  const txId = crypto.randomUUID();
  const statements = [
    db.insert(transaction).values({ id: txId, businessId, userId, cashierName, createdAt: now }),
    db.insert(transactionItem).values(
      productIds.map((pid) => {
        const p = byId.get(pid)!;
        const line = lineByPid.get(pid)!;
        return {
          id: crypto.randomUUID(),
          transactionId: txId,
          productId: pid,
          quantity: merged.get(pid)!,
          // priceAtSale menyimpan harga normal (snapshot); diskon di kolom sendiri.
          priceAtSale: p.sellingPrice,
          costAtSale: p.costPrice,
          discountId: line.discountedQty > 0 ? line.discountId : null,
          discountName: line.discountedQty > 0 ? line.discountName : null,
          discountedQty: line.discountedQty,
          discountAmount: line.discountAmount
        };
      })
    ),
    // Stok dipotong di SQL (stock = stock - qty), bukan dari angka yang dibaca tadi: dua kasir yang jualan bersamaan sama-sama terpotong dengan benar.
    // Kalau stok tak cukup, CHECK product_stock_nonneg menggagalkan batch → seluruh struk rollback.
    ...productIds.map((pid) =>
      db
        .update(product)
        .set({ stock: sql`${product.stock} - ${merged.get(pid)!}`, updatedAt: new Date() })
        .where(and(eq(product.id, pid), eq(product.businessId, businessId)))
    ),
    db.insert(stockMovement).values(
      productIds.map((pid) => ({
        id: crypto.randomUUID(),
        businessId,
        productId: pid,
        qtyChange: -merged.get(pid)!,
        reason: 'SALE' as const,
        refTxId: txId,
        createdBy: userId
      }))
    ),
    // quotaUsed naik per unit terdiskon, juga saat quota null (jadi data "unit terjual dengan diskon ini").
    // CHECK quota_not_exceeded yang menjaga race: batch kedua yang kelebihan kuota gagal total.
    ...deltas.map((d) =>
      db
        .update(discount)
        .set({ quotaUsed: sql`${discount.quotaUsed} + ${d.units}` })
        .where(and(eq(discount.id, d.discountId), eq(discount.businessId, businessId)))
    ),
    // Log ikut batch yang sama agar struk dan jejaknya selalu sepasang.
    db.insert(activityLog).values(
      activityRow({
        businessId,
        actor: { id: userId, name: cashierName ?? '-', role },
        ...net,
        action: 'TX_CREATE',
        entityType: 'transaction',
        entityId: txId,
        meta: {
          total: cart.total,
          itemCount: productIds.length,
          qty: [...merged.values()].reduce((a, b) => a + b, 0)
        },
        createdAt: now
      })
    )
  ];

  try {
    await runBatch(statements);
  } catch (e) {
    const violation = checkViolationName(e);
    if (violation === 'product_stock_nonneg') {
      return fail(409, 'Stok berubah, ada produk yang sudah terjual habis oleh kasir lain. Muat ulang lalu coba lagi.');
    }
    if (violation === 'discount_quota_not_exceeded') {
      return fail(409, 'Kuota diskon berubah, dipakai kasir lain. Muat ulang lalu coba lagi.', { errorCode: 'QUOTA_CHANGED' });
    }
    return fail(500, 'Gagal menyimpan transaksi, coba lagi.');
  }

  return { ok: true, data: { txId } };
}

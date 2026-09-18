import { db } from '$lib/server/db';
import { transaction, transactionItem, product, user } from '$lib/server/db/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const businessId = locals.user!.businessId as string;

  const rows = await db
    .select({
      id: transaction.id,
      createdAt: transaction.createdAt,
      servedBy: user.name,
      productName: product.name,
      quantity: transactionItem.quantity,
      priceAtSale: transactionItem.priceAtSale
    })
    .from(transaction)
    .innerJoin(transactionItem, eq(transactionItem.transactionId, transaction.id))
    .innerJoin(product, eq(product.id, transactionItem.productId))
    .innerJoin(user, eq(user.id, transaction.userId))
    .where(eq(transaction.businessId, businessId))
    .orderBy(desc(transaction.createdAt))
    .limit(100);

  // Buat dropdown produk di panel "Transaksi Baru" — hanya produk aktif.
  const products = await db
    .select({ id: product.id, name: product.name, sellingPrice: product.sellingPrice })
    .from(product)
    .where(and(eq(product.businessId, businessId), eq(product.isActive, true)));

  return { transactions: rows, products };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const businessId = locals.user?.businessId as string | undefined;
    const userId = locals.user?.id as string | undefined;
    if (!businessId || !userId) return fail(403, { message: 'Sesi tidak valid.' });

    const form = await request.formData();
    let rawItems: unknown;
    try {
      rawItems = JSON.parse(String(form.get('items') ?? '[]'));
    } catch {
      return fail(400, { message: 'Format keranjang tidak valid.' });
    }
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return fail(400, { message: 'Keranjang masih kosong.' });
    }
    if (rawItems.length > 50) return fail(400, { message: 'Maksimal 50 jenis produk per struk.' });

    // Gabungkan duplikat productId + validasi qty integer 1..1000.
    const merged = new Map<string, number>();
    for (const it of rawItems as Array<{ productId?: unknown; qty?: unknown }>) {
      const productId = typeof it?.productId === 'string' ? it.productId : '';
      const qty = typeof it?.qty === 'number' ? it.qty : Number(it?.qty);
      if (!productId) return fail(400, { message: 'Ada produk tanpa id.' });
      if (!Number.isInteger(qty) || qty < 1 || qty > 1000) {
        return fail(400, { message: 'Qty harus bilangan bulat 1–1000.' });
      }
      merged.set(productId, (merged.get(productId) ?? 0) + qty);
    }
    const productIds = Array.from(merged.keys());

    // Harga tidak dipercaya dari client — ambil fresh dari DB + pastikan
    // produk aktif milik bisnis ini.
    const dbProducts = await db
      .select({
        id: product.id,
        sellingPrice: product.sellingPrice,
        costPrice: product.costPrice,
        isActive: product.isActive
      })
      .from(product)
      .where(and(eq(product.businessId, businessId), inArray(product.id, productIds)));

    if (dbProducts.length !== productIds.length) {
      return fail(400, { message: 'Ada produk yang tidak ditemukan.' });
    }
    const inactive = dbProducts.find((p) => !p.isActive);
    if (inactive) return fail(400, { message: 'Ada produk nonaktif di keranjang.' });

    const byId = new Map(dbProducts.map((p) => [p.id, p]));
    const cashierName =
      (locals.user?.name as string | null | undefined) ??
      (locals.user?.email as string | undefined)?.split('@')[0] ??
      null;

    // neon-http tidak mendukung db.transaction interaktif, jadi insert
    // berurutan: header dulu, baru items. Kalau items gagal, header
    // dibersihkan manual biar tidak ada struk yatim.
    const txId = crypto.randomUUID();
    await db.insert(transaction).values({ id: txId, businessId, userId, cashierName });

    try {
      await db.insert(transactionItem).values(
        productIds.map((pid) => {
          const p = byId.get(pid)!;
          return {
            id: crypto.randomUUID(),
            transactionId: txId,
            productId: pid,
            quantity: merged.get(pid)!,
            priceAtSale: p.sellingPrice,
            costAtSale: p.costPrice
          };
        })
      );
    } catch {
      await db.delete(transactionItem).where(eq(transactionItem.transactionId, txId));
      await db.delete(transaction).where(eq(transaction.id, txId));
      return fail(500, { message: 'Gagal menyimpan transaksi, coba lagi.' });
    }

    return { success: true };
  }
};
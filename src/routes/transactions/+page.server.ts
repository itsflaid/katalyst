import { db } from '$lib/server/db';
import { transaction, transactionItem, product, user } from '$lib/server/db/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 20;

export const load: PageServerLoad = async ({ locals, url }) => {
  const businessId = locals.user!.businessId as string;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // Header struk dulu (paginasi per struk, bukan per item) — leftJoin user
  // biar struk staff yang sudah dihapus tetap tampil via cashier_name.
  const headers = await db
    .select({
      id: transaction.id,
      createdAt: transaction.createdAt,
      cashierName: transaction.cashierName,
      userName: user.name
    })
    .from(transaction)
    .leftJoin(user, eq(user.id, transaction.userId))
    .where(eq(transaction.businessId, businessId))
    .orderBy(desc(transaction.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset(offset);
  const hasMore = headers.length > PAGE_SIZE;
  const pageHeaders = headers.slice(0, PAGE_SIZE);

  let receipts: {
    txId: string;
    createdAt: Date;
    cashier: string;
    total: number;
    items: { productId: string; productName: string; quantity: number; priceAtSale: number }[];
  }[] = [];
  if (pageHeaders.length > 0) {
    const txIds = pageHeaders.map((h) => h.id);
    const itemRows = await db
      .select({
        transactionId: transactionItem.transactionId,
        productId: transactionItem.productId,
        productName: product.name,
        quantity: transactionItem.quantity,
        priceAtSale: transactionItem.priceAtSale
      })
      .from(transactionItem)
      .innerJoin(product, eq(product.id, transactionItem.productId))
      .where(inArray(transactionItem.transactionId, txIds));

    const byTx = new Map<string, typeof itemRows>();
    for (const r of itemRows) {
      const list = byTx.get(r.transactionId) ?? [];
      list.push(r);
      byTx.set(r.transactionId, list);
    }
    receipts = pageHeaders.map((h) => {
      const items = byTx.get(h.id) ?? [];
      return {
        txId: h.id,
        createdAt: h.createdAt,
        cashier: h.cashierName ?? h.userName ?? '—',
        total: items.reduce((s, i) => s + i.quantity * i.priceAtSale, 0),
        items: items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          priceAtSale: i.priceAtSale
        }))
      };
    });
  }

  // Buat dropdown produk di panel "Transaksi Baru" — hanya produk aktif.
  const products = await db
    .select({ id: product.id, name: product.name, sellingPrice: product.sellingPrice })
    .from(product)
    .where(and(eq(product.businessId, businessId), eq(product.isActive, true)));

  return { receipts, products, page, hasMore };
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
  },

  // Batalkan struk: hapus header + items atomik berurutan. OWNER-only — kasir
  // yang salah catat lapor ke owner, owner yang membatalkan lalu buat struk
  // koreksi baru. Tidak ada edit qty in-place biar histori teraudit.
  deleteTx: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'OWNER') {
      return fail(403, { message: 'Cuma Owner yang bisa membatalkan struk.' });
    }
    const businessId = locals.user.businessId as string;
    const form = await request.formData();
    const txId = String(form.get('txId') ?? '');
    if (!txId) return fail(400, { message: 'Id struk wajib diisi.' });

    const [existing] = await db
      .select({ id: transaction.id })
      .from(transaction)
      .where(and(eq(transaction.id, txId), eq(transaction.businessId, businessId)));
    if (!existing) return fail(404, { message: 'Struk tidak ditemukan.' });

    await db.delete(transactionItem).where(eq(transactionItem.transactionId, txId));
    await db.delete(transaction).where(eq(transaction.id, txId));
    return { success: true };
  }
};
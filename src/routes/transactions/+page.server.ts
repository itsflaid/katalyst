import { db } from '$lib/server/db';
import { stockMovement, transaction, transactionItem, product, user } from '$lib/server/db/schema';
import { eq, desc, and, asc, inArray, sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 20;

export const load: PageServerLoad = async ({ locals, url }) => {
  const businessId = locals.user!.businessId as string;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // Opsi filter kasir: semua user aktif bisnis ini (Owner paling atas).
  // Value = userId (stabil walau staff ganti nama), label = nama TERKINI.
  const staffRows = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.businessId, businessId))
    .orderBy(sql`CASE WHEN ${user.role} = 'OWNER' THEN 0 ELSE 1 END`, asc(user.createdAt));
  const staffOptions = staffRows.map((s) => ({ id: s.id, name: s.name ?? s.email.split('@')[0] }));

  // Filter kasir berbasis userId — bukan nama. Struk lama staff yang sudah
  // ganti nama tetap keikut karena transaction.userId tidak berubah-ubah
  // (yang berubah cuma snapshot cashier_name buat tampilan).
  const kasirParam = url.searchParams.get('kasir') ?? '';
  const kasir = staffRows.some((s) => s.id === kasirParam) ? kasirParam : null;

  // Header struk dulu (paginasi per struk, bukan per item) — leftJoin user
  // biar struk staff yang sudah dihapus tetap tampil via cashier_name.
  const conditions = [eq(transaction.businessId, businessId)];
  if (kasir) conditions.push(eq(transaction.userId, kasir));
  const headers = await db
    .select({
      id: transaction.id,
      createdAt: transaction.createdAt,
      cashierName: transaction.cashierName,
      userName: user.name
    })
    .from(transaction)
    .leftJoin(user, eq(user.id, transaction.userId))
    .where(and(...conditions))
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
  // Stok ikut dikirim biar dropdown bisa menandai yang habis.
  const products = await db
    .select({ id: product.id, name: product.name, sellingPrice: product.sellingPrice, stock: product.stock })
    .from(product)
    .where(and(eq(product.businessId, businessId), eq(product.isActive, true)));

  return { receipts, products, page, hasMore, staffOptions, kasir };
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
        name: product.name,
        sellingPrice: product.sellingPrice,
        costPrice: product.costPrice,
        stock: product.stock,
        isActive: product.isActive
      })
      .from(product)
      .where(and(eq(product.businessId, businessId), inArray(product.id, productIds)));

    if (dbProducts.length !== productIds.length) {
      return fail(400, { message: 'Ada produk yang tidak ditemukan.' });
    }
    const inactive = dbProducts.find((p) => !p.isActive);
    if (inactive) return fail(400, { message: 'Ada produk nonaktif di keranjang.' });
    // Tolak seluruh struk kalau satu item pun stoknya kurang — jangan
    // simpan sebagian biar kasir betulkan dulu.
    const short = dbProducts.find((p) => merged.get(p.id)! > p.stock);
    if (short) return fail(400, { message: `Stok ${short.name} kurang (sisa ${short.stock}).` });

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
      // Kurangi stok + catat ledger SALE. Stok yang habis (0) otomatis
      // menonaktifkan produk biar tidak bisa dijual lagi.
      for (const pid of productIds) {
        const p = byId.get(pid)!;
        const qty = merged.get(pid)!;
        const newStock = p.stock - qty;
        await db
          .update(product)
          .set({ stock: newStock, isActive: newStock <= 0 ? false : p.isActive, updatedAt: new Date() })
          .where(eq(product.id, pid));
        await db.insert(stockMovement).values({
          id: crypto.randomUUID(),
          businessId,
          productId: pid,
          qtyChange: -qty,
          reason: 'SALE',
          refTxId: txId,
          createdBy: userId
        });
      }
    } catch {
      await db.delete(stockMovement).where(eq(stockMovement.refTxId, txId));
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

    // Kembalikan stok yang tadi dikurangi + catat ledger. Produk yang
    // stoknya 0 (otomatis nonaktif saat habis) aktif lagi.
    const voidItems = await db
      .select({ productId: transactionItem.productId, quantity: transactionItem.quantity })
      .from(transactionItem)
      .where(eq(transactionItem.transactionId, txId));
    const voidStocks = new Map<string, number>();
    if (voidItems.length > 0) {
      const stockRows = await db
        .select({ id: product.id, stock: product.stock })
        .from(product)
        .where(inArray(product.id, voidItems.map((i) => i.productId)));
      for (const r of stockRows) voidStocks.set(r.id, r.stock);
    }
    for (const i of voidItems) {
      const curStock = voidStocks.get(i.productId) ?? 0;
      await db
        .update(product)
        .set({ stock: curStock + i.quantity, isActive: true, updatedAt: new Date() })
        .where(eq(product.id, i.productId));
      await db.insert(stockMovement).values({
        id: crypto.randomUUID(),
        businessId,
        productId: i.productId,
        qtyChange: i.quantity,
        reason: 'VOID_RESTORE',
        refTxId: txId,
        createdBy: locals.user!.id as string
      });
    }

    await db.delete(transactionItem).where(eq(transactionItem.transactionId, txId));
    await db.delete(transaction).where(eq(transaction.id, txId));
    return { success: true };
  }
};
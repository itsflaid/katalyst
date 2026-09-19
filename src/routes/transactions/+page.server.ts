import { db } from '$lib/server/db';
import { stockMovement, transaction, transactionItem, product, user } from '$lib/server/db/schema';
import { eq, desc, and, asc, inArray, gt, sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 20;

// CHECK product_stock_nonneg (SQLSTATE 23514) meledak kalau stok terpotong
// jadi minus — artinya ada penjualan lain yang menghabiskan stok di sela
// validasi dan penyimpanan. Bentuk error-nya beda antar driver/versi
// (kode di error langsung atau di `cause`), jadi dicek dua-duanya.
function isStockCheckViolation(e: unknown): boolean {
  const err = e as { code?: string; message?: string; cause?: { code?: string; message?: string } } | null;
  if (err?.code === '23514' || err?.cause?.code === '23514') return true;
  return /product_stock_nonneg/.test(`${err?.message ?? ''} ${err?.cause?.message ?? ''}`);
}

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

  // Buat dropdown produk di panel "Transaksi Baru" — hanya produk aktif yang
  // stoknya masih ada. Habis = tersembunyi dari kasir (turunan dari stok,
  // isActive sendiri tidak disentuh).
  const products = await db
    .select({ id: product.id, name: product.name, sellingPrice: product.sellingPrice, stock: product.stock })
    .from(product)
    .where(and(eq(product.businessId, businessId), eq(product.isActive, true), gt(product.stock, 0)));

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

    // neon-http tidak punya db.transaction interaktif, tapi db.batch([...])
    // menjalankan semua statement dalam SATU transaksi: struk, item, stok,
    // dan ledger masuk semua atau tidak sama sekali. Jadi tidak ada lagi
    // struk yatim / stok setengah terpotong yang perlu dibersihkan manual.
    const txId = crypto.randomUUID();
    const statements = [
      db.insert(transaction).values({ id: txId, businessId, userId, cashierName }),
      db.insert(transactionItem).values(
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
      ),
      // Stok dipotong di SQL (stock = stock - qty), bukan dari angka yang
      // dibaca tadi: dua kasir yang jualan bersamaan sama-sama terpotong
      // dengan benar. Kalau stok tak cukup, CHECK product_stock_nonneg
      // menggagalkan batch → seluruh struk rollback.
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
      )
    ];

    try {
      await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
    } catch (e) {
      if (isStockCheckViolation(e)) {
        return fail(409, { message: 'Stok berubah — ada produk yang sudah terjual habis oleh kasir lain. Muat ulang lalu coba lagi.' });
      }
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

    // Satu statement (CTE) = atomik dan idempoten: item struk dihapus dan
    // langsung dipakai sebagai sumber pengembalian stok + ledger, lalu header
    // struk dihapus. Kalau owner klik dua kali / dua tab membatalkan struk
    // yang sama, yang kedua menemukan item sudah tidak ada → stok tidak
    // dikembalikan dua kali. isActive tidak disentuh.
    await db.execute(sql`
      with removed as (
        delete from transaction_item ti
        where ti.transaction_id = ${txId}
          and exists (
            select 1 from "transaction" t
            where t.id = ti.transaction_id and t.business_id = ${businessId}
          )
        returning ti.product_id, ti.quantity
      ),
      restored as (
        update product p
        set stock = p.stock + r.qty, updated_at = now()
        from (
          select product_id, sum(quantity)::integer as qty
          from removed
          group by product_id
        ) r
        where p.id = r.product_id and p.business_id = ${businessId}
        returning p.id as product_id, r.qty
      ),
      ledger as (
        insert into stock_movement (id, business_id, product_id, qty_change, reason, ref_tx_id, created_by)
        select gen_random_uuid()::text, ${businessId}::text, product_id, qty,
               'VOID_RESTORE'::stock_reason, ${txId}::text, ${locals.user.id as string}::text
        from restored
      )
      delete from "transaction" where id = ${txId} and business_id = ${businessId}
    `);
    return { success: true };
  }
};
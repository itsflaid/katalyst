import { db } from '$lib/server/db';
import { product, stockMovement, transactionItem } from '$lib/server/db/schema';
import { denyUnlessOwner, getOwnedProduct, parseProductFields, parseInitialStock } from '$lib/server/domains/products';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
// crypto.randomUUID global (bukan import 'crypto') biar jalan di Workers.
// Node 19+ dan semua browser modern juga menyediakannya.
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const businessId = locals.user!.businessId as string;
  const products = await db.select().from(product).where(eq(product.businessId, businessId));
  // role ikut dikirim biar UI bisa menyembunyikan aksi yang memang ditolak server.
  const role: 'OWNER' | 'STAFF' = locals.user!.role === 'OWNER' ? 'OWNER' : 'STAFF';
  return { products, role };
};

// -----------------------------------------------------------------------
// Actions
//
// Catatan neon-http: tidak ada db.transaction interaktif, tapi db.batch([...])
// menjalankan semua statement dalam SATU transaksi (gagal satu = rollback
// semua). Semua perubahan stok + ledger di bawah lewat batch.
// -----------------------------------------------------------------------

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const denied = denyUnlessOwner(locals, 'create', 'Cuma Owner yang bisa menambah produk.');
    if (denied) return denied;
    const businessId = locals.user!.businessId as string;
    const userId = locals.user!.id as string;

    const form = await request.formData();
    const parsed = parseProductFields(form);
    if ('error' in parsed) return fail(400, { for: 'create', message: parsed.error });
    const initial = parseInitialStock(form);
    if ('error' in initial) return fail(400, { for: 'create', message: initial.error });

    const id = crypto.randomUUID();
    const insertProduct = db
      .insert(product)
      .values({ id, businessId, ...parsed.data, stock: initial.data });

    if (initial.data > 0) {
      // Stok awal ikut dicatat di ledger biar saldo stok bisa ditelusuri
      // dari nol (bukan muncul begitu saja).
      await db.batch([
        insertProduct,
        db.insert(stockMovement).values({
          id: crypto.randomUUID(),
          businessId,
          productId: id,
          qtyChange: initial.data,
          reason: 'RESTOCK',
          note: 'Stok awal',
          createdBy: userId
        })
      ]);
    } else {
      await insertProduct;
    }
    return { success: true };
  },

  update: async ({ request, locals }) => {
    const denied = denyUnlessOwner(locals, 'update', 'Cuma Owner yang bisa mengubah produk.');
    if (denied) return denied;
    const businessId = locals.user!.businessId as string;

    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const parsed = parseProductFields(form);
    if ('error' in parsed) return fail(400, { for: 'update', message: parsed.error });
    if (!(await getOwnedProduct(id, businessId))) {
      return fail(404, { for: 'update', message: 'Produk tidak ditemukan.' });
    }
    // parsed.data tidak berisi stock → stok tidak tersentuh.
    await db
      .update(product)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(product.id, id), eq(product.businessId, businessId)));
    return { success: true };
  },

  // isActive = pilihan owner (jual / tidak dijual). Tidak ada hubungan
  // dengan stok: produk stok 0 tetap "aktif" tapi otomatis tersembunyi di
  // kasir dan berlabel Habis.
  toggle: async ({ request, locals }) => {
    const denied = denyUnlessOwner(locals, 'toggle', 'Cuma Owner yang bisa mengubah status produk.');
    if (denied) return denied;
    const businessId = locals.user!.businessId as string;

    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const isActive = form.get('isActive') === 'on';
    if (!(await getOwnedProduct(id, businessId))) {
      return fail(404, { for: 'toggle', message: 'Produk tidak ditemukan.' });
    }
    await db
      .update(product)
      .set({ isActive, updatedAt: new Date() })
      .where(and(eq(product.id, id), eq(product.businessId, businessId)));
    return { success: true };
  },

  delete: async ({ request, locals }) => {
    const denied = denyUnlessOwner(locals, 'delete', 'Cuma Owner yang bisa menghapus produk.');
    if (denied) return denied;
    const businessId = locals.user!.businessId as string;

    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    if (!(await getOwnedProduct(id, businessId))) {
      return fail(404, { for: 'delete', message: 'Produk tidak ditemukan.' });
    }

    const hasSalesHistory = () =>
      fail(400, {
        for: 'delete',
        message: 'Produk sudah punya riwayat penjualan — nonaktifkan saja.'
      });

    // Riwayat penjualan (item struk, atau ledger SALE/VOID_RESTORE dari struk
    // yang sudah dibatalkan) tidak boleh hilang. Ledger RESTOCK/ADJUST milik
    // produk yang belum pernah terjual ikut dibersihkan — kalau tidak, stok
    // awal yang kini tercatat di ledger bikin produk salah input tak bisa
    // dihapus karena FK.
    const [sold] = await db
      .select({ id: transactionItem.id })
      .from(transactionItem)
      .where(eq(transactionItem.productId, id))
      .limit(1);
    const [moved] = await db
      .select({ id: stockMovement.id })
      .from(stockMovement)
      .where(and(eq(stockMovement.productId, id), inArray(stockMovement.reason, ['SALE', 'VOID_RESTORE'])))
      .limit(1);
    if (sold || moved) return hasSalesHistory();

    try {
      await db.batch([
        db.delete(stockMovement).where(eq(stockMovement.productId, id)),
        db.delete(product).where(and(eq(product.id, id), eq(product.businessId, businessId)))
      ]);
    } catch {
      // Ada penjualan yang masuk di sela cek dan hapus (FK menolak).
      return hasSalesHistory();
    }
    return { success: true };
  },

  // Tambah stok (restock). OWNER-only. Tidak mengubah isActive.
  restock: async ({ request, locals }) => {
    const denied = denyUnlessOwner(locals, 'restock', 'Cuma Owner yang bisa restock.');
    if (denied) return denied;
    const businessId = locals.user!.businessId as string;
    const userId = locals.user!.id as string;

    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const qty = Number(form.get('qty'));
    const note = String(form.get('note') ?? '').trim() || null;
    if (!Number.isInteger(qty) || qty < 1 || qty > 100000) {
      return fail(400, { for: 'restock', message: 'Jumlah restock harus bilangan bulat 1–100000.' });
    }
    if (!(await getOwnedProduct(id, businessId))) {
      return fail(404, { for: 'restock', message: 'Produk tidak ditemukan.' });
    }

    await db.batch([
      // Naik di SQL (stock = stock + qty), bukan baca-hitung-tulis dari JS,
      // jadi penjualan yang masuk bersamaan tidak tertimpa.
      db
        .update(product)
        .set({ stock: sql`${product.stock} + ${qty}`, updatedAt: new Date() })
        .where(and(eq(product.id, id), eq(product.businessId, businessId))),
      db.insert(stockMovement).values({
        id: crypto.randomUUID(),
        businessId,
        productId: id,
        qtyChange: qty,
        reason: 'RESTOCK',
        note,
        createdBy: userId
      })
    ]);
    return { success: true };
  },

  // Koreksi stok hasil opname. OWNER-only, alasan wajib biar teraudit.
  adjust: async ({ request, locals }) => {
    const denied = denyUnlessOwner(locals, 'adjust', 'Cuma Owner yang bisa koreksi stok.');
    if (denied) return denied;
    const businessId = locals.user!.businessId as string;
    const userId = locals.user!.id as string;

    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const stock = Number(form.get('stock'));
    const note = String(form.get('note') ?? '').trim();
    if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) {
      return fail(400, { for: 'adjust', message: 'Stok harus bilangan bulat 0–1000000.' });
    }
    if (!note) return fail(400, { for: 'adjust', message: 'Alasan koreksi wajib diisi.' });
    const existing = await getOwnedProduct(id, businessId);
    if (!existing) return fail(404, { for: 'adjust', message: 'Produk tidak ditemukan.' });
    if (stock === existing.stock) return fail(400, { for: 'adjust', message: 'Tidak ada perubahan.' });

    await db.batch([
      // Ledger DULU: selisih dihitung di DB dari stok saat statement ini
      // jalan (bukan dari angka yang kita baca tadi), jadi tetap benar kalau
      // ada penjualan di sela-sela. Statement berikutnya baru set stoknya.
      db.insert(stockMovement).values({
        id: crypto.randomUUID(),
        businessId,
        productId: id,
        qtyChange: sql<number>`${stock}::integer - (select ${product.stock} from ${product} where ${product.id} = ${id})`,
        reason: 'ADJUST',
        note,
        createdBy: userId
      }),
      db
        .update(product)
        .set({ stock, updatedAt: new Date() })
        .where(and(eq(product.id, id), eq(product.businessId, businessId)))
    ]);
    return { success: true };
  }
};

import { db } from '$lib/server/db';
import { stockMovement, transaction, transactionItem, product, user, discount } from '$lib/server/db/schema';
import { eq, desc, and, asc, inArray, gte, lt, or, sql } from 'drizzle-orm';
import { DEFAULT_TZ, isBizTz, makeTime } from '$lib/shared/time';
import { calculateCart, getDiscountStatus, quotaDeltas } from '$lib/discount';
import { receiptTotals } from '$lib/analytics';
import { getActiveProductDiscounts, getGlobalDiscount } from '$lib/server/domains/discounts';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 20;

// Format Rp ala kasir (duplikat kecil dari +page.svelte biar pesan server
// tidak bergantung pada helper client).
const idr = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

// CHECK ..._nonneg / ..._not_exceeded (SQLSTATE 23514) meledak kalau stok terpotong minus atau kuota diskon terlampaui, ada kasir lain yang menghabiskan stok/kuota di sela validasi dan penyimpanan.
// Bentuk error beda antar driver/versi (kode di error langsung atau di `cause`), jadi nama constraint dicari di keduanya.
function checkViolationName(e: unknown): string | null {
  const err = e as {
    code?: unknown;
    constraint?: unknown;
    message?: unknown;
    cause?: { code?: unknown; constraint?: unknown; message?: unknown };
  } | null;
  const hay = `${String(err?.code ?? '')} ${String(err?.constraint ?? '')} ${String(err?.message ?? '')} ${String(err?.cause?.code ?? '')} ${String(err?.cause?.constraint ?? '')} ${String(err?.cause?.message ?? '')}`;
  if (/discount_quota_not_exceeded/.test(hay)) return 'discount_quota_not_exceeded';
  if (/product_stock_nonneg/.test(hay)) return 'product_stock_nonneg';
  if (err?.code === '23514' || err?.cause?.code === '23514') return 'check_23514';
  return null;
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const businessId = locals.user!.businessId as string;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // Opsi filter kasir: semua user aktif bisnis ini (Owner paling atas).
  // Value = userId (stabil walau staff ganti nama), label = nama terkini.
  const staffRows = await db
    .select({ id: user.id, name: user.name, username: user.username })
    .from(user)
    .where(eq(user.businessId, businessId))
    .orderBy(sql`CASE WHEN ${user.role} = 'OWNER' THEN 0 ELSE 1 END`, asc(user.createdAt));
  const staffOptions = staffRows.map((s) => ({ id: s.id, name: s.name ?? s.username ?? '-' }));

  // Filter kasir berbasis userId, bukan nama. Struk lama staff yang sudah
  // ganti nama tetap keikut karena transaction.userId tidak berubah-ubah
  // (yang berubah cuma snapshot cashier_name buat tampilan).
  const kasirParam = url.searchParams.get('kasir') ?? '';
  const kasir = staffRows.some((s) => s.id === kasirParam) ? kasirParam : null;

  // Header struk diproses lebih awal (paginasi per struk, bukan per item); leftJoin user biar struk staff yang sudah dihapus tetap tampil via cashier_name.
  const conditions = [eq(transaction.businessId, businessId)];
  if (kasir) conditions.push(eq(transaction.userId, kasir));
  // Filter rentang memakai tanggal zona bisnis, bukan UTC. Tiap ujung valid
  // jadi batas kueri; ujung rusak diabaikan. Dari > sampai otomatis ditukar.
  const tzRaw = locals.business?.timezone;
  const T = makeTime(isBizTz(tzRaw) ? tzRaw : DEFAULT_TZ);
  let fromStart = T.parseDay((url.searchParams.get('from') ?? '').trim());
  let toStart = T.parseDay((url.searchParams.get('to') ?? '').trim());
  if (fromStart && toStart && fromStart.getTime() > toStart.getTime()) {
    const t = fromStart;
    fromStart = toStart;
    toStart = t;
  }
  const rangeFrom = fromStart ? T.dayKey(fromStart) : null;
  const rangeTo = toStart ? T.dayKey(toStart) : null;
  if (fromStart) conditions.push(gte(transaction.createdAt, fromStart));
  if (toStart) conditions.push(lt(transaction.createdAt, T.addDays(toStart, 1)));
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
    subtotal: number;
    discountTotal: number;
    total: number;
    items: {
      productId: string;
      productName: string;
      quantity: number;
      priceAtSale: number;
      discountName: string | null;
      discountedQty: number;
      discountAmount: number;
    }[];
  }[] = [];
  if (pageHeaders.length > 0) {
    const txIds = pageHeaders.map((h) => h.id);
    const itemRows = await db
      .select({
        transactionId: transactionItem.transactionId,
        productId: transactionItem.productId,
        productName: product.name,
        quantity: transactionItem.quantity,
        priceAtSale: transactionItem.priceAtSale,
        discountName: transactionItem.discountName,
        discountedQty: transactionItem.discountedQty,
        discountAmount: transactionItem.discountAmount
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
      // Total struk dihitung engine (receiptTotals).
      const totals = receiptTotals(items);
      return {
        txId: h.id,
        createdAt: h.createdAt,
        cashier: h.cashierName ?? h.userName ?? '-',
        ...totals,
        items: items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          priceAtSale: i.priceAtSale,
          discountName: i.discountName,
          discountedQty: i.discountedQty,
          discountAmount: i.discountAmount
        }))
      };
    });
  }

  // Produk habis ikut dikirim supaya tampil abu-abu dan tidak bisa di-tap. costPrice sengaja tidak dipilih, halaman ini bisa dibuka STAFF.
  const products = await db
    .select({ id: product.id, name: product.name, sellingPrice: product.sellingPrice, stock: product.stock, minStock: product.minStock })
    .from(product)
    .where(and(eq(product.businessId, businessId), eq(product.isActive, true)));

  // Diskon untuk preview client: yang isActive dan belum berakhir.
  // Status final tetap dihitung server saat create (jam server).
  const now = new Date();
  const discountRows = await db
    .select({
      id: discount.id,
      name: discount.name,
      scope: discount.scope,
      percent: discount.percent,
      productId: discount.productId,
      isActive: discount.isActive,
      startsAt: discount.startsAt,
      endsAt: discount.endsAt,
      quota: discount.quota,
      quotaUsed: discount.quotaUsed,
      createdAt: discount.createdAt
    })
    .from(discount)
    .where(
      and(
        eq(discount.businessId, businessId),
        eq(discount.isActive, true),
        or(sql`${discount.endsAt} is null`, gte(discount.endsAt, now))
      )
    );
  const discounts = discountRows.map((d) => ({
    ...d,
    startsAt: d.startsAt.toISOString(),
    endsAt: d.endsAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString()
  }));

  return { receipts, products, page, hasMore, staffOptions, kasir, rangeFrom, rangeTo, timezone: locals.business?.timezone ?? DEFAULT_TZ, serverNow: Date.now(), discounts };
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
    // Diskon global pilihan kasir (opsional) + total harapan dari preview
    // client untuk deteksi harga berubah.
    const globalDiscountIdRaw = String(form.get('globalDiscountId') ?? '').trim();
    const globalDiscountId = globalDiscountIdRaw === '' ? null : globalDiscountIdRaw;
    // expectedTotal yang hilang/kosong berarti klien lama atau cacat → tolak.
    // Jangan anggap 0: total 0 yang sah (mis. diskon 100%) lolos via '0' eksplisit.
    const expectedRaw = form.get('expectedTotal');
    const expectedTotal = expectedRaw === null || String(expectedRaw).trim() === '' ? NaN : Number(expectedRaw);
    if (!Number.isInteger(expectedTotal) || expectedTotal < 0) {
      return fail(400, { message: 'Total harapan tidak valid.' });
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
      return fail(400, { message: 'Ada produk yang tidak ditemukan.' });
    }
    const inactive = dbProducts.find((p) => !p.isActive);
    if (inactive) return fail(400, { message: 'Ada produk nonaktif di keranjang.' });
    // Tolak seluruh struk kalau satu item pun stoknya kurang, jangan simpan sebagian sebelum kasir betulkan.
    const short = dbProducts.find((p) => merged.get(p.id)! > p.stock);
    if (short) return fail(400, { message: `Stok ${short.name} kurang (sisa ${short.stock}).` });

    const byId = new Map(dbProducts.map((p) => [p.id, p]));
    const cashierName =
      (locals.user?.name as string | null | undefined) ??
      ((locals.user as { username?: string | null } | null | undefined)?.username) ??
      null;

    // neon-http tidak punya db.transaction interaktif; db.batch([...]) menjalankan semua statement dalam satu transaksi: struk, item, stok, ledger, dan quota diskon masuk semua atau tidak sama sekali.
    // now dipakai sebagai createdAt struk sekaligus jam cek diskon.
    const now = new Date();

    // Ambil diskon produk ACTIVE + global pilihan (harga tetap dari DB).
    const productDiscounts = await getActiveProductDiscounts(businessId, productIds, now);
    let global: Awaited<ReturnType<typeof getGlobalDiscount>> | null = null;
    if (globalDiscountId) {
      global = await getGlobalDiscount(businessId, globalDiscountId);
      if (!global || global.scope !== 'GLOBAL' || getDiscountStatus({ ...global, scope: 'GLOBAL' }, now) !== 'ACTIVE') {
        return fail(409, {
          code: 'DISCOUNT_UNAVAILABLE',
          message: global
            ? `Diskon "${global.name}" sudah tidak berlaku. Muat ulang lalu coba lagi.`
            : 'Diskon global tidak ditemukan. Muat ulang lalu coba lagi.'
        });
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
      return fail(409, {
        code: 'PRICE_CHANGED',
        message: `Harga berubah, total sekarang ${idr(cart.total)}. Periksa keranjang lalu catat ulang.`,
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
      )
    ];

    try {
      await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
    } catch (e) {
      const violation = checkViolationName(e);
      if (violation === 'product_stock_nonneg') {
        return fail(409, { message: 'Stok berubah, ada produk yang sudah terjual habis oleh kasir lain. Muat ulang lalu coba lagi.' });
      }
      if (violation === 'discount_quota_not_exceeded') {
        return fail(409, {
          code: 'QUOTA_CHANGED',
          message: 'Kuota diskon berubah, dipakai kasir lain. Muat ulang lalu coba lagi.'
        });
      }
      return fail(500, { message: 'Gagal menyimpan transaksi, coba lagi.' });
    }

    return { success: true };
  },

  // Void struk: hapus header + items atomik berurutan. OWNER-only, kasir
  // yang salah catat lapor ke owner, owner yang melakukan void lalu buat struk
  // koreksi baru. Tidak ada edit qty in-place biar histori teraudit.
  deleteTx: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'OWNER') {
      return fail(403, { message: 'Cuma Owner yang bisa void struk.' });
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

    // Satu statement (CTE) agar atomik dan idempoten: item terhapus jadi sumber pengembalian stok + kuota + ledger.
    // Klik ganda aman (upaya kedua tak menemukan item); isActive tak tersentuh; CHECK quota_used >= 0 jadi jaring pengaman.
    await db.execute(sql`
      with removed as (
        delete from transaction_item ti
        where ti.transaction_id = ${txId}
          and exists (
            select 1 from "transaction" t
            where t.id = ti.transaction_id and t.business_id = ${businessId}
          )
        returning ti.product_id, ti.quantity, ti.discount_id, ti.discounted_qty
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
      quota_restored as (
        update discount d
        set quota_used = d.quota_used - r.units
        from (
          select discount_id, sum(discounted_qty)::integer as units
          from removed where discount_id is not null and discounted_qty > 0
          group by discount_id
        ) r
        where d.id = r.discount_id and d.business_id = ${businessId}
        returning d.id
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
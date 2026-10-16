import { db } from '$lib/server/db';
import { discount, product, transaction, transactionItem, user } from '$lib/server/db/schema';
import { and, asc, desc, eq, gte, inArray, lt, or, sql } from 'drizzle-orm';
import { DEFAULT_TZ, isBizTz, makeTime } from '$lib/shared/time';
import { receiptTotals } from '$lib/analytics';

const PAGE_SIZE = 20;

export interface PosQuery {
  page: string | null;
  kasir: string | null;
  from: string | null;
  to: string | null;
  tzRaw: unknown;
}

export async function loadPosPage(businessId: string, q: PosQuery) {
  const page = Math.max(1, Number(q.page ?? '1') || 1);
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
  const kasirParam = q.kasir ?? '';
  const kasir = staffRows.some((s) => s.id === kasirParam) ? kasirParam : null;

  // Header struk diproses lebih awal (paginasi per struk, bukan per item); leftJoin user biar struk staff yang sudah dihapus tetap tampil via cashier_name.
  const conditions = [eq(transaction.businessId, businessId)];
  if (kasir) conditions.push(eq(transaction.userId, kasir));
  // Filter rentang memakai tanggal zona bisnis, bukan UTC. Tiap ujung valid
  // jadi batas kueri; ujung rusak diabaikan. Dari > sampai otomatis ditukar.
  const timezone = isBizTz(q.tzRaw) ? q.tzRaw : DEFAULT_TZ;
  const T = makeTime(timezone);
  let fromStart = T.parseDay((q.from ?? '').trim());
  let toStart = T.parseDay((q.to ?? '').trim());
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
    .where(and(eq(discount.businessId, businessId), eq(discount.isActive, true), or(sql`${discount.endsAt} is null`, gte(discount.endsAt, now))));
  const discounts = discountRows.map((d) => ({
    ...d,
    startsAt: d.startsAt.toISOString(),
    endsAt: d.endsAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString()
  }));

  return {
    receipts,
    products,
    page,
    hasMore,
    staffOptions,
    kasir,
    rangeFrom,
    rangeTo,
    timezone,
    serverNow: Date.now(),
    discounts
  };
}

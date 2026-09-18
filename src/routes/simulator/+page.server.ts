import { db } from '$lib/server/db';
import { product, transaction, transactionItem } from '$lib/server/db/schema';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { calculateMargin } from '$lib/analytics';
import type { PageServerLoad } from './$types';

type RangeKey = 'today' | 'week' | 'month' | 'all' | 'custom';

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

function parseDateParam(v: string | null): Date | null {
  if (!v) return null;
  // Terima YYYY-MM-DD dari <input type="date">.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function resolveRange(url: URL): { key: RangeKey; from: Date | null; to: Date | null; label: string; fromISO: string; toISO: string } {
  const raw = (url.searchParams.get('range') ?? 'month').toLowerCase();
  const now = new Date();
  if (raw === 'today') {
    const from = startOfDay(now);
    return { key: 'today', from, to: now, label: 'Hari ini', fromISO: '', toISO: '' };
  }
  if (raw === 'week') {
    // Minggu ini: Senin 00:00 → sekarang (konvensi Indonesia).
    const offset = (now.getDay() + 6) % 7;
    const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset));
    return { key: 'week', from, to: now, label: 'Minggu ini (Senin–sekarang)', fromISO: '', toISO: '' };
  }
  if (raw === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { key: 'month', from, to: now, label: 'Bulan ini', fromISO: '', toISO: '' };
  }
  if (raw === 'custom') {
    const f = parseDateParam(url.searchParams.get('from'));
    const t = parseDateParam(url.searchParams.get('to'));
    if (!f && !t) return { key: 'all', from: null, to: null, label: 'Semua waktu', fromISO: '', toISO: '' };
    const from = f ? startOfDay(f) : null;
    const to = t ? endOfDay(t) : now;
    const fmt = (d: Date) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    const label = from && t ? `${fmt(from)} – ${fmt(endOfDay(t))}` : from ? `Sejak ${fmt(from)}` : `Sampai ${fmt(to!)}`;
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { key: 'custom', from, to, label: `Custom: ${label}`, fromISO: from ? iso(from) : '', toISO: t ? iso(endOfDay(t)) : '' };
  }
  return { key: 'all', from: null, to: null, label: 'Semua waktu', fromISO: '', toISO: '' };
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const businessId = locals.user!.businessId as string;
  const range = resolveRange(url);

  // Baseline per produk dihitung di SQL (GROUP BY) — yang ditransfer cuma
  // 1 baris per produk, bukan 1 baris per item transaksi. Sebelumnya load
  // mengembalikan semua item mentah (±13rb rows di seed 90 hari) sehingga
  // tiap buka simulator terasa delay; sekarang jauh lebih ringan.
  // Produk tanpa histori tetap masuk dengan angka nol + txCount 0.
  const conds = [eq(transaction.businessId, businessId)];
  if (range.from) conds.push(gte(transaction.createdAt, range.from));
  if (range.to) conds.push(lte(transaction.createdAt, range.to));
  const [products, aggRows] = await Promise.all([
    db.select().from(product).where(eq(product.businessId, businessId)),
    db
      .select({
        productId: transactionItem.productId,
        qty: sql<string>`sum(${transactionItem.quantity})::text`,
        revenue: sql<string>`sum(${transactionItem.quantity}::bigint * ${transactionItem.priceAtSale})::text`,
        cost: sql<string>`sum(${transactionItem.quantity}::bigint * ${transactionItem.costAtSale})::text`,
        txCount: sql<string>`count(distinct ${transaction.id})::text`
      })
      .from(transactionItem)
      .innerJoin(transaction, eq(transaction.id, transactionItem.transactionId))
      .where(and(...conds))
      .groupBy(transactionItem.productId)
  ]);

  const agg = new Map(
    aggRows.map((r) => [
      r.productId,
      {
        qty: Number(r.qty),
        revenue: Number(r.revenue),
        cost: Number(r.cost),
        txCount: Number(r.txCount)
      }
    ])
  );

  const baselines = products.map((p) => {
    const a = agg.get(p.id);
    const revenue = a?.revenue ?? 0;
    const cost = a?.cost ?? 0;
    const profit = revenue - cost;
    return {
      productId: p.id,
      qty: a?.qty ?? 0,
      revenue,
      cost,
      profit,
      margin: calculateMargin(revenue, profit),
      txCount: a?.txCount ?? 0
    };
  });

  return {
    products,
    baselines,
    preselectedProductId: url.searchParams.get('productId') ?? products[0]?.id ?? null,
    range: range.key,
    rangeLabel: range.label,
    rangeFrom: range.fromISO,
    rangeTo: range.toISO
  };
};

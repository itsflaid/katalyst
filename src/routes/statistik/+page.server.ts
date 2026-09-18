import { db } from '$lib/server/db';
import { product, transaction, transactionItem } from '$lib/server/db/schema';
import { and, count, eq, gte, lte, sql } from 'drizzle-orm';
import {
  calculateMargin,
  compareProductPeriods,
  getLowMarginProducts,
  type ProductSummary
} from '$lib/analytics';
import type { PageServerLoad } from './$types';

type RangeKey = 'today' | 'week' | '30d' | 'month' | 'custom';

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
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function resolveRange(url: URL): { key: RangeKey; from: Date; to: Date; label: string; fromISO: string; toISO: string } {
  const raw = (url.searchParams.get('range') ?? '30d').toLowerCase();
  const now = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (raw === 'today') {
    const from = startOfDay(now);
    return { key: 'today', from, to: now, label: 'Hari ini', fromISO: '', toISO: '' };
  }
  if (raw === 'week') {
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
    if (f || t) {
      const from = f ? startOfDay(f) : new Date(now.getTime() - 29 * 86400000);
      const to = t ? endOfDay(t) : now;
      const [a, b] = from <= to ? [from, to] : [to, from];
      const fmt = (d: Date) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      return { key: 'custom', from: a, to: b, label: `Custom: ${fmt(a)} – ${fmt(b)}`, fromISO: iso(a), toISO: iso(b) };
    }
  }
  const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
  return { key: '30d', from, to: now, label: '30 hari terakhir', fromISO: '', toISO: '' };
}

function toSummaries(
  rows: { productId: string; qty: string; revenue: string; cost: string }[],
  names: Record<string, string>
): ProductSummary[] {
  return rows.map((g) => {
    const quantitySold = Number(g.qty);
    const revenue = Number(g.revenue);
    const cost = Number(g.cost);
    const profit = revenue - cost;
    return {
      productId: g.productId,
      name: names[g.productId] ?? 'Produk tidak dikenal',
      quantitySold,
      revenue,
      cost,
      profit,
      margin: calculateMargin(revenue, profit)
    };
  });
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const businessId = locals.user!.businessId as string;
  const range = resolveRange(url);

  // Periode pembanding: durasi sama panjang, tepat sebelum periode aktif.
  const dur = range.to.getTime() - range.from.getTime();
  const prevTo = range.from;
  const prevFrom = new Date(range.from.getTime() - Math.max(dur, 1));

  const perProduct = (from: Date, to: Date) =>
    db
      .select({
        productId: transactionItem.productId,
        qty: sql<string>`sum(${transactionItem.quantity})::text`,
        revenue: sql<string>`sum(${transactionItem.quantity}::bigint * ${transactionItem.priceAtSale})::text`,
        cost: sql<string>`sum(${transactionItem.quantity}::bigint * ${transactionItem.costAtSale})::text`
      })
      .from(transactionItem)
      .innerJoin(transaction, eq(transaction.id, transactionItem.transactionId))
      .where(
        and(
          eq(transaction.businessId, businessId),
          gte(transaction.createdAt, from),
          lte(transaction.createdAt, to)
        )
      )
      .groupBy(transactionItem.productId);

  const [products, curRows, prevRows, dailyRows, prevTxRows] = await Promise.all([
    db
      .select({ id: product.id, name: product.name })
      .from(product)
      .where(eq(product.businessId, businessId)),
    perProduct(range.from, range.to),
    perProduct(prevFrom, prevTo),
    db
      .select({
        day: sql<string>`(${transaction.createdAt}::date)::text`,
        revenue: sql<string>`sum(${transactionItem.quantity}::bigint * ${transactionItem.priceAtSale})::text`,
        cost: sql<string>`sum(${transactionItem.quantity}::bigint * ${transactionItem.costAtSale})::text`,
        txCount: sql<string>`count(distinct ${transaction.id})::text`
      })
      .from(transaction)
      .innerJoin(transactionItem, eq(transactionItem.transactionId, transaction.id))
      .where(
        and(
          eq(transaction.businessId, businessId),
          gte(transaction.createdAt, range.from),
          lte(transaction.createdAt, range.to)
        )
      )
      .groupBy(sql`(${transaction.createdAt}::date)`),
    db
      .select({ value: count() })
      .from(transaction)
      .where(
        and(
          eq(transaction.businessId, businessId),
          gte(transaction.createdAt, prevFrom),
          lte(transaction.createdAt, prevTo)
        )
      )
  ]);

  const names = Object.fromEntries(products.map((p) => [p.id, p.name]));
  const cur = toSummaries(curRows, names);
  const prev = toSummaries(prevRows, names);
  const rows = compareProductPeriods(cur, prev).sort((a, b) => b.current.revenue - a.current.revenue);

  const sum = (arr: ProductSummary[], f: (p: ProductSummary) => number) => arr.reduce((s, p) => s + f(p), 0);
  const curRev = sum(cur, (p) => p.revenue);
  const prevRev = sum(prev, (p) => p.revenue);
  const curProfit = sum(cur, (p) => p.profit);
  const prevProfit = sum(prev, (p) => p.profit);
  const pct = (c: number, p: number): number | null => {
    if (p === 0) return c === 0 ? 0 : null;
    return ((c - p) / Math.abs(p)) * 100;
  };
  const tx = dailyRows.reduce((s, r) => s + Number(r.txCount), 0);
  const prevTx = prevTxRows[0]?.value ?? 0;

  // Deret harian berurutan (isi 0 hari kosong) dalam jt Rp biar sumbu terbaca.
  const byDay = new Map(dailyRows.map((r) => [r.day, r]));
  const labels: string[] = [];
  const revenue: number[] = [];
  const profit: number[] = [];
  const marginTrend: number[] = [];
  let bestDayLabel = '—';
  let bestDayRevenue = 0;
  const cursor = startOfDay(range.from);
  const end = range.to;
  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    const v = byDay.get(key);
    const rev = v ? Number(v.revenue) : 0;
    const cost = v ? Number(v.cost) : 0;
    const label = `${cursor.getDate()}/${cursor.getMonth() + 1}`;
    labels.push(label);
    revenue.push(Math.round((rev / 1_000_000) * 10) / 10);
    profit.push(Math.round(((rev - cost) / 1_000_000) * 10) / 10);
    marginTrend.push(rev === 0 ? 0 : Math.round(((rev - cost) / rev) * 1000) / 10);
    if (rev > bestDayRevenue) {
      bestDayRevenue = rev;
      bestDayLabel = cursor.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const topBar = [...cur].sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  const profitTop = [...cur].sort((a, b) => b.profit - a.profit).slice(0, 8);
  // Komposisi profit: 8 produk paling menguntungkan + "Lainnya".
  // Hanya profit positif yang masuk pie (slice negatif merusak chart).
  const profitable = [...cur].filter((p) => p.profit > 0).sort((a, b) => b.profit - a.profit);
  const pieTop = profitable.slice(0, 8);
  const pieRest = curProfit - pieTop.reduce((s, p) => s + p.profit, 0);
  const pieLabels = pieTop.map((p) => p.name);
  const pieData = pieTop.map((p) => p.profit);
  if (pieRest > 0) {
    pieLabels.push('Lainnya');
    pieData.push(pieRest);
  }
  const withSales = cur.filter((p) => p.revenue > 0);
  const byMargin = [...withSales].sort((a, b) => b.margin - a.margin);
  const avgTicket = tx === 0 ? 0 : curRev / tx;
  const prevAvg = prevTx === 0 ? 0 : prevRev / prevTx;

  return {
    range: range.key,
    rangeLabel: range.label,
    rangeFrom: range.fromISO,
    rangeTo: range.toISO,
    kpi: {
      revenue: curRev,
      profit: curProfit,
      margin: calculateMargin(curRev, curProfit),
      tx
    },
    deltas: {
      revenue: pct(curRev, prevRev),
      profit: pct(curProfit, prevProfit),
      transactions: pct(tx, prevTx),
      // Selisih margin dalam poin ×100 biar se-skala dengan badge persen.
      margin: (calculateMargin(curRev, curProfit) - calculateMargin(prevRev, prevProfit)) * 100
    },
    trend: { labels, revenue, profit },
    marginTrend,
    bar: { labels: topBar.map((p) => p.name), data: topBar.map((p) => p.revenue) },
    pie: { labels: pieLabels, data: pieData },
    profitBar: { labels: profitTop.map((p) => p.name), data: profitTop.map((p) => p.profit) },
    marginBar: {
      labels: topBar.map((p) => p.name),
      data: topBar.map((p) => Math.round(p.margin * 1000) / 10)
    },
    highlights: {
      avgTicket,
      avgTicketDelta: pct(avgTicket, prevAvg),
      bestDayLabel,
      bestDayRevenue,
      topMargin: byMargin.length > 0 ? { name: byMargin[0].name, margin: byMargin[0].margin } : null,
      lowMargin: byMargin.length > 0 ? { name: byMargin[byMargin.length - 1].name, margin: byMargin[byMargin.length - 1].margin } : null,
      totalQty: sum(cur, (p) => p.quantitySold)
    },
    rows,
    lowMargin: getLowMarginProducts(cur, 0.15).map((p) => ({ name: p.name, margin: p.margin }))
  };
};

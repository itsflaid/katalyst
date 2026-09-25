import { db } from '$lib/server/db';
import { product, transaction, transactionItem, user } from '$lib/server/db/schema';
import { and, asc, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import {
  calculateMargin,
  compareProductPeriods,
  estimateDaysCover,
  getBusinessInsights,
  getLowMarginProducts,
  getTopProducts,
  type ProductSummary
} from '$lib/analytics';
import { startOfDayWita, endOfDayWita, addDaysWita, dayKeyWita, toWita, parseDayWita, fmtWita, isoDowWita } from '$lib/shared/time';
import { witaDate } from '$lib/server/sql';
import { queryCashiers, queryHourly, queryInventory, queryMovementWeekly, querySusut, INVENTORY_WINDOW_DAYS } from './queries';
import { pickMoneyUnit, scaleMoney } from '$lib/shared/format';

type StatistikRangeKey = 'today' | 'week' | '30d' | 'month' | 'custom';

function resolveStatistikRange(url: URL): { key: StatistikRangeKey; from: Date; to: Date; label: string; fromISO: string; toISO: string } {
  const raw = (url.searchParams.get('range') ?? '30d').toLowerCase();
  const now = new Date();
  const iso = (d: Date) => dayKeyWita(d);
  if (raw === 'today') {
    const from = startOfDayWita(now);
    return { key: 'today', from, to: now, label: 'Hari ini', fromISO: '', toISO: '' };
  }
  if (raw === 'week') {
    // Senin 00:00 WITA → sekarang (konvensi Indonesia).
    const dow = toWita(now).getUTCDay();
    const offset = (dow + 6) % 7;
    const from = startOfDayWita(addDaysWita(now, -offset));
    return { key: 'week', from, to: now, label: 'Minggu ini (Senin–sekarang)', fromISO: '', toISO: '' };
  }
  if (raw === 'month') {
    const w = toWita(now);
    const firstWita = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), 1) - 8 * 3600_000);
    return { key: 'month', from: firstWita, to: now, label: 'Bulan ini', fromISO: '', toISO: '' };
  }
  if (raw === 'custom') {
    const f = parseDayWita(url.searchParams.get('from') ?? '');
    const tRaw = parseDayWita(url.searchParams.get('to') ?? '');
    if (f || tRaw) {
      const from = f ?? addDaysWita(startOfDayWita(now), -29);
      const to = tRaw ? endOfDayWita(tRaw) : now;
      const [a, b] = from <= to ? [from, to] : [to, from];
      const fmt = (d: Date) => fmtWita(d, { day: 'numeric', month: 'short', year: 'numeric' });
      return { key: 'custom', from: a, to: b, label: `Custom: ${fmt(a)} – ${fmt(b)}`, fromISO: iso(a), toISO: iso(b) };
    }
  }
  const from = startOfDayWita(addDaysWita(now, -29));
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

export async function getStatistikPageData(businessId: string, url: URL) {
  const range = resolveStatistikRange(url);

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

  // Objek ekspresi yang sama dipakai di select & groupBy (lihat sql.ts).
  const witaDayExpr = witaDate(transaction.createdAt);
  const witaDayText = sql<string>`(${witaDayExpr})::text`;

  const [products, curRows, prevRows, dailyRows, prevTxRows, hourlyRows, cashierRows, moveRows, invData, susut] = await Promise.all([
    db
      .select({ id: product.id, name: product.name })
      .from(product)
      .where(eq(product.businessId, businessId)),
    perProduct(range.from, range.to),
    perProduct(prevFrom, prevTo),
    db
      .select({
        day: witaDayText,
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
      // Objek dayExpr dipakai ulang di select & groupBy — jangan inline dua
      // kali (nomor parameter berbeda → Postgres error GROUP BY).
      .groupBy(witaDayExpr),
    db
      .select({ value: count() })
      .from(transaction)
      .where(
        and(
          eq(transaction.businessId, businessId),
          gte(transaction.createdAt, prevFrom),
          lte(transaction.createdAt, prevTo)
        )
      ),
    queryHourly(businessId, range.from, range.to),
    queryCashiers(businessId, range.from, range.to),
    queryMovementWeekly(businessId, range.from, range.to),
    queryInventory(businessId, new Date()),
    querySusut(businessId, range.from, range.to)
  ]);

  const names = Object.fromEntries(products.map((p) => [p.id, p.name]));
  const cur = toSummaries(curRows, names);
  const prev = toSummaries(prevRows, names);
  // Rumus Tabel Performa + Δ: qty/rev/profit/margin kini; Δ=(kini−lalu)÷|lalu|×100% vs periode sama panjang.
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

  // Rumus Tren Revenue/Profit/Margin/Struk: revenue=Σ(qty×jual), profit=rev−Σ(qty×modal),
  // margin=profit/rev×100% per hari WITA (hari kosong=0, best day=rev max).
  const byDay = new Map(dailyRows.map((r) => [r.day, r]));
  const labels: string[] = [];
  const revenueRaw: number[] = [];
  const profitRaw: number[] = [];
  const txRaw: number[] = [];
  const dowRaw: number[] = [];
  const marginTrend: number[] = [];
  let bestDayLabel = '—';
  let bestDayRevenue = 0;
  let cursor = startOfDayWita(range.from);
  const end = range.to;
  while (cursor <= end) {
    const key = dayKeyWita(cursor);
    const v = byDay.get(key);
    const rev = v ? Number(v.revenue) : 0;
    const cost = v ? Number(v.cost) : 0;
    const txd = v ? Number(v.txCount) : 0;
    const w = toWita(cursor);
    const label = `${w.getUTCDate()}/${w.getUTCMonth() + 1}`;
    labels.push(label);
    revenueRaw.push(rev);
    profitRaw.push(rev - cost);
    txRaw.push(txd);
    dowRaw.push(isoDowWita(cursor));
    marginTrend.push(rev === 0 ? 0 : Math.round(((rev - cost) / rev) * 1000) / 10);
    if (rev > bestDayRevenue) {
      bestDayRevenue = rev;
      bestDayLabel = fmtWita(cursor, { weekday: 'long', day: 'numeric', month: 'short' });
    }
    cursor = addDaysWita(cursor, 1);
  }
  const moneyUnit = pickMoneyUnit(Math.max(Math.abs(curRev), Math.abs(curProfit), 0));
  const revenue = scaleMoney(revenueRaw, moneyUnit);
  const profit = scaleMoney(profitRaw, moneyUnit);

  // Rumus Performa per Produk: top 30 by revenue; klien toggle revenue/profit/margin (margin=profit/revenue).
  const productPerf = [...cur]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 30)
    .map((p) => ({ id: p.productId, name: p.name, qty: p.quantitySold, revenue: p.revenue, profit: p.profit, margin: p.margin }));

  // Rumus Komposisi Profit: 8 profit>0 terbesar + "Lainnya"=sisa profit; negatif dibuang.
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
  // Rumus highlight: rata2 struk=rev÷struk; margin max/min=sort margin desc.
  const byMargin = [...withSales].sort((a, b) => b.margin - a.margin);
  const avgTicket = tx === 0 ? 0 : curRev / tx;
  const prevAvg = prevTx === 0 ? 0 : prevRev / prevTx;

  // Rumus Rata-rata Struk/hari: rev hari÷struk hari; null kalau struk=0 (garis putus).
  const avgRaw: (number | null)[] = revenueRaw.map((rev, i) => (txRaw[i] === 0 ? null : rev / txRaw[i]));
  const avgMax = avgRaw.reduce<number>((s, v) => Math.max(s, v ?? 0), 0);
  const avgUnit = pickMoneyUnit(avgMax);
  const avgF = 10 ** avgUnit.decimals;
  const avgTicketPerDay: (number | null)[] = avgRaw.map((v) =>
    v === null ? null : Math.round((v / avgUnit.divisor) * avgF) / avgF
  );

  // Rumus Jam Tersibuk: count struk per jam WITA (kosong=0); puncak=jam max.
  const byHour = new Map(hourlyRows.map((h) => [h.hour, h.tx]));
  const activeHours = [...byHour.entries()].filter(([, t]) => t > 0).map(([h]) => h);
  let hourStart = 0;
  let hourEnd = 23;
  if (activeHours.length > 0) {
    const lo = Math.min(...activeHours);
    const hi = Math.max(...activeHours);
    const span = hi - lo + 1;
    const need = Math.max(span, 8);
    hourStart = Math.max(0, lo - Math.floor((need - span) / 2));
    hourEnd = Math.min(23, hourStart + need - 1);
    hourStart = Math.max(0, hourEnd - need + 1);
  }
  const hourlyLabels: string[] = [];
  const hourlyData: number[] = [];
  let peakHour = hourStart;
  let peakTx = -1;
  for (let h = hourStart; h <= hourEnd; h++) {
    hourlyLabels.push(`${String(h).padStart(2, '0')}.00`);
    const t = byHour.get(h) ?? 0;
    hourlyData.push(t);
    if (t > peakTx) {
      peakTx = t;
      peakHour = h;
    }
  }
  const hourlyTotal = hourlyData.reduce((s, t) => s + t, 0);
  const pad2 = (h: number) => String(h).padStart(2, '0');
  const hourly = {
    labels: hourlyLabels,
    data: hourlyData,
    peak: `${pad2(peakHour)}.00–${pad2((peakHour + 1) % 24)}.00`,
    total: hourlyTotal
  };

  // Rumus Hari Seminggu: rata2 revenue=Σ rev÷kemunculan hari itu; tampil kalau ≥14 hari.
  const dayNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  const dowSums = [0, 0, 0, 0, 0, 0, 0, 0];
  const dowCounts = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < dowRaw.length; i++) {
    dowSums[dowRaw[i]] += revenueRaw[i];
    dowCounts[dowRaw[i]] += 1;
  }
  const weekdayAvg = [1, 2, 3, 4, 5, 6, 7].map((d) => (dowCounts[d] === 0 ? 0 : Math.round(dowSums[d] / dowCounts[d])));
  const weekday = { labels: dayNames, data: weekdayAvg, show: labels.length >= 14 };

  // Rumus per Kasir: revenue=Σ(qty×jual), rata2=rev÷struk; tampil kalau ≥2 kasir.
  const cashiers = [...cashierRows].sort((a, b) => b.revenue - a.revenue);
  const cashierStats = { list: cashiers, show: cashiers.length >= 2 };

  // Rumus Inventori (14 hari tetap): nilai=Σ(stok×modal); mati=stok>0 & sold14=0; hari=stok÷(sold14/14).
  const invProducts = invData.products;
  const stockValue = invProducts.reduce((s, p) => s + p.stock * p.costPrice, 0);
  const invOut = invProducts.filter((p) => p.stock <= 0).length;
  const invRestock = invProducts.filter((p) => p.stock > 0 && p.stock <= (p.minStock ?? 5)).length;
  const deadFull = invProducts
    .filter((p) => p.stock > 0 && p.sold14 === 0)
    .map((p) => ({ id: p.id, name: p.name, stock: p.stock, value: p.stock * p.costPrice }))
    .sort((a, b) => b.value - a.value);
  const deadValue = deadFull.reduce((s, p) => s + p.value, 0);
  const daysList = invProducts
    .filter((p) => p.sold14 > 0)
    .map((p) => ({ id: p.id, name: p.name, stock: p.stock, days: estimateDaysCover(p.stock, p.sold14, INVENTORY_WINDOW_DAYS) }))
    .sort((a, b) => a.days - b.days)
    .slice(0, 8);
  const inventory = {
    windowDays: INVENTORY_WINDOW_DAYS,
    stockValue,
    outCount: invOut,
    restockCount: invRestock,
    deadCount: deadFull.length,
    deadValue,
    daysList,
    deadList: deadFull.slice(0, 5)
  };

  // Rumus Gerak Stok/minggu: Σ qtyChange per Senin WITA×alasan; Terjual=-(SALE); susut=koreksi negatif×modal.
  const weeks = [...new Set(moveRows.map((r) => r.week))].sort();
  const moveBy = new Map(moveRows.map((r) => [`${r.week}|${r.reason}`, r.qty]));
  const moveLabels = weeks.map((wk) => {
    const [, m, d] = wk.split('-').map(Number);
    return `${d}/${m}`;
  });
  const movement = {
    labels: moveLabels,
    restock: weeks.map((wk) => moveBy.get(`${wk}|RESTOCK`) ?? 0),
    void: weeks.map((wk) => moveBy.get(`${wk}|VOID_RESTORE`) ?? 0),
    sold: weeks.map((wk) => -(moveBy.get(`${wk}|SALE`) ?? 0)),
    adjust: weeks.map((wk) => moveBy.get(`${wk}|ADJUST`) ?? 0),
    susut: susut
  };

  // Rumus Matriks: x=qty, y=margin%, ukuran=√(rev/maxRev); garis=median qty & margin bisnis.
  const quantities = withSales.map((p) => p.quantitySold).sort((a, b) => a - b);
  const medianQty = quantities.length === 0 ? 0 : quantities[Math.floor(quantities.length / 2)];
  const overallMargin = calculateMargin(curRev, curProfit);
  const maxRev = Math.max(1, ...withSales.map((p) => p.revenue));
  const matrix = {
    show: withSales.length >= 3,
    xLine: medianQty,
    yLine: Math.round(overallMargin * 1000) / 10,
    points: withSales.map((p) => ({
      x: p.quantitySold,
      y: Math.round(p.margin * 1000) / 10,
      r: Math.round((5 + (Math.sqrt(p.revenue / maxRev) * 13)) * 10) / 10,
      label: p.name,
      href: `/simulator?productId=${p.productId}`
    }))
  };

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
    trend: { labels, revenue, profit, unitLabel: moneyUnit.label },
    marginTrend,
    pie: { labels: pieLabels, data: pieData },
    productPerf,
    txPerDay: txRaw,
    avgTicketPerDay: { data: avgTicketPerDay, unitLabel: avgUnit.label },
    hourly,
    weekday,
    cashiers: cashierStats,
    inventory,
    movement,
    matrix,
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
    // Rumus Margin tipis: margin=profit/revenue <15%.
    lowMargin: getLowMarginProducts(cur, 0.15).map((p) => ({ name: p.name, margin: p.margin }))
  };
}

export async function getDashboardPageData(businessId: string) {
  // 4 query independen — jalan PARALEL dalam satu round-trip, bukan serial.
  // Agregasi KPI dihitung di SQL (GROUP BY + SUM) sehingga yang ditransfer
  // cuma 1 baris per produk, bukan 1 baris per item transaksi (yang tumbuh
  // tanpa batas: 12rb+ baris saat ini). Hasil angkanya identik dengan
  // agregasi JS sebelumnya (penjumlahan integer bersifat asosiatif), cuma
  // lokasi hitungnya pindah ke database.
  // Query ke-5: agregat harian 60 hari terakhir — 1 query melayani tren
  // (30 hari terakhir) + delta (30 hari ini vs 30 hari sebelumnya).
  // Semua batas hari & bucket memakai WITA (bukan UTC / lokal server).
  const sixtyDaysAgo = startOfDayWita(addDaysWita(new Date(), -59));
  // Objek ekspresi yang sama dipakai di select & groupBy (lihat sql.ts).
  const dayExpr = witaDate(transaction.createdAt);
  const [products, grouped, countRows, recentTransactions, dailyRows, restockList, restockCounts] = await Promise.all([
    db
      .select({ id: product.id, name: product.name })
      .from(product)
      .where(eq(product.businessId, businessId)),

    db
      .select({
        productId: transactionItem.productId,
        // SUM numeric PG balik sebagai string via driver — di-Number() di bawah.
        // quantity*price di-cast ke bigint dulu biar baris ekstrem gak
        // overflow int4 di sisi database.
        quantitySold: sql<string>`sum(${transactionItem.quantity})::text`,
        revenue: sql<string>`sum(${transactionItem.quantity}::bigint * ${transactionItem.priceAtSale})::text`,
        cost: sql<string>`sum(${transactionItem.quantity}::bigint * ${transactionItem.costAtSale})::text`
      })
      .from(transactionItem)
      .innerJoin(transaction, eq(transaction.id, transactionItem.transactionId))
      .where(eq(transaction.businessId, businessId))
      .groupBy(transactionItem.productId),

    // Jumlah transaksi real (bukan jumlah baris item) — dipakai gantiin
    // card "Cost" di KPI row biar gak overlap sama chart revenue-per-produk,
    // dan lebih deket ke "Transaction Volume" di referensi desain.
    db
      .select({ value: count() })
      .from(transaction)
      .where(eq(transaction.businessId, businessId)),

    // 10 item transaksi terbaru untuk card dashboard — leftJoin user biar
    // struk staff yang sudah dihapus tetap tampil via cashier_name.
    db
      .select({
        productName: product.name,
        quantity: transactionItem.quantity,
        priceAtSale: transactionItem.priceAtSale,
        createdAt: transaction.createdAt,
        cashierName: transaction.cashierName,
        userName: user.name
      })
      .from(transaction)
      .innerJoin(transactionItem, eq(transactionItem.transactionId, transaction.id))
      .innerJoin(product, eq(product.id, transactionItem.productId))
      .leftJoin(user, eq(user.id, transaction.userId))
      .where(eq(transaction.businessId, businessId))
      .orderBy(desc(transaction.createdAt))
      .limit(10),

    db
      .select({
        day: sql<string>`(${dayExpr})::text`,
        revenue: sql<string>`sum(${transactionItem.quantity}::bigint * ${transactionItem.priceAtSale})::text`,
        cost: sql<string>`sum(${transactionItem.quantity}::bigint * ${transactionItem.costAtSale})::text`,
        txCount: sql<string>`count(distinct ${transaction.id})::text`
      })
      .from(transaction)
      .innerJoin(transactionItem, eq(transactionItem.transactionId, transaction.id))
      .where(and(eq(transaction.businessId, businessId), gte(transaction.createdAt, sixtyDaysAgo)))
      .groupBy(dayExpr),

    // Kartu "Perlu restock": produk aktif dengan stok <= ambang, 5 paling
    // kritis + hitungan habis & menipis.
    db
      .select({ id: product.id, name: product.name, stock: product.stock, minStock: product.minStock })
      .from(product)
      .where(
        and(
          eq(product.businessId, businessId),
          eq(product.isActive, true),
          sql`${product.stock} <= ${product.minStock}`
        )
      )
      .orderBy(asc(product.stock))
      .limit(5),

    db
      .select({
        habis: sql<string>`count(*) filter (where ${product.stock} <= 0)::text`,
        menipis: sql<string>`count(*) filter (where ${product.stock} > 0 and ${product.stock} <= ${product.minStock})::text`
      })
      .from(product)
      .where(eq(product.businessId, businessId))
  ]);

  const productNames = Object.fromEntries(products.map((p) => [p.id, p.name]));

  // Bentuk ProductSummary persis kayak summarizeByProduct lama (termasuk
  // fallback nama & aturan margin revenue-0), cuma sumber angkanya dari SQL.
  const perProduct: ProductSummary[] = grouped.map((g) => {
    const quantitySold = Number(g.quantitySold);
    const revenue = Number(g.revenue);
    const cost = Number(g.cost);
    const profit = revenue - cost;
    return {
      productId: g.productId,
      name: productNames[g.productId] ?? 'Produk tidak dikenal',
      quantitySold,
      revenue,
      cost,
      profit,
      margin: calculateMargin(revenue, profit)
    };
  });

  // Total bisnis = jumlahkan total per produk — sama persis dengan menjumlah
  // semua item dulu baru ditotal (asosiatif), jadi KPI tidak berubah.
  const revenue = perProduct.reduce((s, p) => s + p.revenue, 0);
  const cost = perProduct.reduce((s, p) => s + p.cost, 0);
  const profit = revenue - cost;
  const summary = { revenue, cost, profit, margin: calculateMargin(revenue, profit) };

  const topByRevenue = getTopProducts(perProduct, 'revenue', 5);
  const insights = getBusinessInsights(perProduct).slice(0, 3);

  const [{ value: transactionCount }] = countRows;

  // Bangun deret harian 60 hari (isi 0 untuk hari tanpa transaksi) dari
  // hasil GROUP BY di atas. 30 hari terakhir → tren chart (dalam jt Rp
  // biar sumbu terbaca), 30 vs 30 sebelumnya → delta KPI.
  const byDay = new Map(
    dailyRows.map((r) => [
      r.day,
      { revenue: Number(r.revenue), cost: Number(r.cost), tx: Number(r.txCount) }
    ])
  );
  const days: { key: string; label: string; revenue: number; profit: number; tx: number }[] = [];
  const todayStart = startOfDayWita(new Date());
  for (let i = 59; i >= 0; i--) {
    const d = addDaysWita(todayStart, -i);
    const key = dayKeyWita(d);
    const w = toWita(d);
    const v = byDay.get(key) ?? { revenue: 0, cost: 0, tx: 0 };
    days.push({
      key,
      label: `${w.getUTCDate()}/${w.getUTCMonth() + 1}`,
      revenue: v.revenue,
      profit: v.revenue - v.cost,
      tx: v.tx
    });
  }
  const prev = days.slice(0, 30);
  const cur = days.slice(30);
  const sum = (arr: typeof days, f: (d: (typeof days)[number]) => number) =>
    arr.reduce((s, d) => s + f(d), 0);
  const curRev = sum(cur, (d) => d.revenue);
  const prevRev = sum(prev, (d) => d.revenue);
  const curProfit = sum(cur, (d) => d.profit);
  const prevProfit = sum(prev, (d) => d.profit);
  const curTx = sum(cur, (d) => d.tx);
  const prevTx = sum(prev, (d) => d.tx);
  const pct = (c: number, p: number): number | null => {
    if (p === 0) return c === 0 ? 0 : null;
    return ((c - p) / Math.abs(p)) * 100;
  };
  const curMargin = calculateMargin(curRev, curProfit);
  const prevMargin = calculateMargin(prevRev, prevProfit);
  // Unit sumbu adaptif (rb/jt) biar warung omzet ratusan ribu tidak patah-patah.
  const moneyUnit = pickMoneyUnit(Math.max(Math.abs(curRev), Math.abs(curProfit), 0));
  const trend = {
    labels: cur.map((d) => d.label),
    revenue: scaleMoney(
      cur.map((d) => d.revenue),
      moneyUnit
    ),
    profit: scaleMoney(
      cur.map((d) => d.profit),
      moneyUnit
    ),
    unitLabel: moneyUnit.label
  };
  const deltas = {
    revenue: pct(curRev, prevRev),
    profit: pct(curProfit, prevProfit),
    transactions: pct(curTx, prevTx),
    // poin margin ×100 biar se-skala dengan badge persen.
    margin: prevRev === 0 && curRev === 0 ? 0 : (curMargin - prevMargin) * 100
  };

  const [{ habis, menipis }] = restockCounts;
  const restock = {
    list: restockList,
    habis: Number(habis ?? 0),
    menipis: Number(menipis ?? 0)
  };

  return { summary, topByRevenue, recentTransactions, transactionCount, trend, deltas, insights, restock };
}

type SimulatorRangeKey = 'today' | 'week' | 'month' | 'all' | 'custom';

function resolveSimulatorRange(url: URL): { key: SimulatorRangeKey; from: Date | null; to: Date | null; label: string; fromISO: string; toISO: string } {
  const raw = (url.searchParams.get('range') ?? 'month').toLowerCase();
  const now = new Date();
  if (raw === 'today') {
    const from = startOfDayWita(now);
    return { key: 'today', from, to: now, label: 'Hari ini', fromISO: '', toISO: '' };
  }
  if (raw === 'week') {
    // Minggu ini: Senin 00:00 WITA → sekarang (konvensi Indonesia).
    const dow = toWita(now).getUTCDay();
    const offset = (dow + 6) % 7;
    const from = startOfDayWita(addDaysWita(now, -offset));
    return { key: 'week', from, to: now, label: 'Minggu ini (Senin–sekarang)', fromISO: '', toISO: '' };
  }
  if (raw === 'month') {
    const w = toWita(now);
    const from = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), 1) - 8 * 3600_000);
    return { key: 'month', from, to: now, label: 'Bulan ini', fromISO: '', toISO: '' };
  }
  if (raw === 'custom') {
    const f = parseDayWita(url.searchParams.get('from') ?? '');
    const tRaw = parseDayWita(url.searchParams.get('to') ?? '');
    if (!f && !tRaw) return { key: 'all', from: null, to: null, label: 'Semua waktu', fromISO: '', toISO: '' };
    const from = f ?? null;
    const to = tRaw ? endOfDayWita(tRaw) : now;
    const fmt = (d: Date) => fmtWita(d, { day: 'numeric', month: 'short', year: 'numeric' });
    const label = from && tRaw ? `${fmt(from)} – ${fmt(endOfDayWita(tRaw))}` : from ? `Sejak ${fmt(from)}` : `Sampai ${fmt(to!)}`;
    // iso buat <input type="date"> memakai hari WITA.
    const witaIso = (d: Date) => {
      const w2 = toWita(d);
      return `${w2.getUTCFullYear()}-${String(w2.getUTCMonth() + 1).padStart(2, '0')}-${String(w2.getUTCDate()).padStart(2, '0')}`;
    };
    return { key: 'custom', from, to, label: `Custom: ${label}`, fromISO: from ? witaIso(from) : '', toISO: tRaw ? witaIso(endOfDayWita(tRaw)) : '' };
  }
  return { key: 'all', from: null, to: null, label: 'Semua waktu', fromISO: '', toISO: '' };
}

export async function getSimulatorPageData(businessId: string, url: URL) {
  const range = resolveSimulatorRange(url);

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
}

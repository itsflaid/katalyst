import { db } from '$lib/server/db';
import { product, transaction } from '$lib/server/db/schema';
import { and, asc, count, eq, gte, lte, sql } from 'drizzle-orm';
import {
  calculateMargin,
  compareProductPeriods,
  deltaRatio,
  estimateDaysCover,
  fillDailySeries,
  getBusinessInsights,
  getLowMarginProducts,
  getTopProducts,
  summarizeFacts,
  totalsOf,
  type ProductSummary
} from '$lib/analytics';
import { makeTime, type BizTz } from '$lib/shared/time';
import { previousWindow, resolvePeriod } from '$lib/shared/period';
import { queryFactsByDay, queryFactsByProduct } from '$lib/server/domains/facts/queries';
import { queryRecentReceipts } from '$lib/server/domains/transactions/recent';
import { metricsOf, ZERO_FACTS } from '$lib/analytics';
import { queryCashiers, queryHourly, queryInventory, queryMovementWeekly, querySusut, INVENTORY_WINDOW_DAYS } from './queries';
import { pickMoneyUnit, scaleMoney } from '$lib/shared/format';

export async function getStatistikPageData(businessId: string, url: URL, tz: BizTz) {
  const T = makeTime(tz);
  const period = resolvePeriod(url, tz, new Date(), { default: '30d', allow: ['today', 'week', 'month', '30d', 'custom'] });
  // Statistik tak memakai 'all': from/to selalu terisi (dijamin resolver).
  if (!period.from || !period.to) throw new Error('Rentang statistik harus berawal dan berakhir.');
  const range = { key: period.key, from: period.from, to: period.to, label: period.label, fromISO: period.fromISO, toISO: period.toISO };

  // Periode pembanding: durasi sama panjang, tepat sebelum periode aktif.
  const prevWin = previousWindow(range);
  const prevTo = prevWin.to;
  const prevFrom = prevWin.from;

  const perProduct = (from: Date, to: Date) => queryFactsByProduct(db, businessId, { from, to });

  const [products, curRows, prevRows, dailyRows, prevTxRows, hourlyRows, cashierRows, moveRows, invData, susut] = await Promise.all([
    db
      .select({ id: product.id, name: product.name })
      .from(product)
      .where(eq(product.businessId, businessId)),
    perProduct(range.from, range.to),
    perProduct(prevFrom, prevTo),
    // Agregat harian dari lapisan Facts.
    queryFactsByDay(db, businessId, { from: range.from, to: range.to }, tz),
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
    queryHourly(businessId, range.from, range.to, tz),
    queryCashiers(businessId, range.from, range.to),
    queryMovementWeekly(businessId, range.from, range.to, tz),
    queryInventory(businessId, new Date(), tz),
    querySusut(businessId, range.from, range.to)
  ]);

  const names = Object.fromEntries(products.map((p) => [p.id, p.name]));
  const cur = summarizeFacts(curRows, names);
  const prev = summarizeFacts(prevRows, names);
  // Tabel Performa + Δ: qty/rev/profit/margin periode ini vs periode sama panjang.
  const rows = compareProductPeriods(cur, prev).sort((a, b) => b.current.revenue - a.current.revenue);

  const sum = (arr: ProductSummary[], f: (p: ProductSummary) => number) => arr.reduce((s, p) => s + f(p), 0);
  const curRev = sum(cur, (p) => p.revenue);
  const prevRev = sum(prev, (p) => p.revenue);
  const curProfit = sum(cur, (p) => p.profit);
  const prevProfit = sum(prev, (p) => p.profit);
  // Delta persen tunggal (pecahan → ×100); null tetap null ("baru").
  const pct = (c: number, p: number): number | null => {
    const r = deltaRatio(c, p);
    return r === null ? null : r * 100;
  };
  const tx = [...dailyRows.values()].reduce((s, r) => s + r.txCount, 0);
  const prevTx = prevTxRows[0]?.value ?? 0;

  // Tren Revenue/Profit/Margin/Struk per hari zona bisnis dari engine
  // (hari kosong=0, best day=rev max, margin dibulatkan 1 desimal % di sini).
  const series = fillDailySeries(dailyRows, { from: range.from, to: range.to, T });
  const labels = series.map((s) => s.label);
  const revenueRaw = series.map((s) => s.revenue);
  const profitRaw = series.map((s) => s.profit);
  const txRaw = series.map((s) => s.tx);
  const dowRaw = series.map((s) => s.isoDow);
  const marginTrend = series.map((s) => (s.revenue === 0 ? 0 : Math.round((s.profit / s.revenue) * 1000) / 10));
  let bestDayLabel = '—';
  let bestDayRevenue = 0;
  for (const s of series) {
    if (s.revenue > bestDayRevenue) {
      bestDayRevenue = s.revenue;
      const d = T.parseDay(s.key);
      if (d) bestDayLabel = T.fmt(d, { weekday: 'long', day: 'numeric', month: 'short' });
    }
  }
  const moneyUnit = pickMoneyUnit(Math.max(Math.abs(curRev), Math.abs(curProfit), 0));
  const revenue = scaleMoney(revenueRaw, moneyUnit);
  const profit = scaleMoney(profitRaw, moneyUnit);

  // productPerf = 30 teratas menurut revenue (margin ikut dari summary).
  const productPerf = [...cur]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 30)
    .map((p) => ({ id: p.productId, name: p.name, qty: p.quantitySold, revenue: p.revenue, profit: p.profit, margin: p.margin }));

  // pieRest = curProfit − Σ pieTop.profit (Rupiah)
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
  // avgTicket = curRev / tx   (0 bila tx = 0)
  // prevAvg = prevRev / prevTx   (0 bila prevTx = 0)
  const avgTicket = tx === 0 ? 0 : curRev / tx;
  const prevAvg = prevTx === 0 ? 0 : prevRev / prevTx;

  // avgRaw = rev hari / struk hari; null bila struk hari = 0 (garis putus).
  const avgRaw: (number | null)[] = revenueRaw.map((rev, i) => (txRaw[i] === 0 ? null : rev / txRaw[i]));
  const avgMax = avgRaw.reduce<number>((s, v) => Math.max(s, v ?? 0), 0);
  const avgUnit = pickMoneyUnit(avgMax);
  const avgF = 10 ** avgUnit.decimals;
  const avgTicketPerDay: (number | null)[] = avgRaw.map((v) =>
    v === null ? null : Math.round((v / avgUnit.divisor) * avgF) / avgF
  );

  // hourly = count struk per jam zona bisnis (kosong = 0); peak = jam max.
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

  // weekdayAvg[d] = dowSums[d] / dowCounts[d]; tampil kalau ≥14 hari.
  const dayNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  const dowSums = [0, 0, 0, 0, 0, 0, 0, 0];
  const dowCounts = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < dowRaw.length; i++) {
    dowSums[dowRaw[i]] += revenueRaw[i];
    dowCounts[dowRaw[i]] += 1;
  }
  const weekdayAvg = [1, 2, 3, 4, 5, 6, 7].map((d) => (dowCounts[d] === 0 ? 0 : Math.round(dowSums[d] / dowCounts[d])));
  const weekday = { labels: dayNames, data: weekdayAvg, show: labels.length >= 14 };

  // cashierStats.show = kasir >= 2; revenue/rata2 dihitung di queryCashiers.
  const cashiers = [...cashierRows].sort((a, b) => b.revenue - a.revenue);
  const cashierStats = { list: cashiers, show: cashiers.length >= 2 };

  // stockValue = Σ stock × costPrice   (Rupiah)
  // out        = stock ≤ 0
  // restock    = 0 < stock ≤ minStock   (minStock kosong dianggap 5)
  // dead       = stock > 0 dan sold14 = 0
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

  // movement.sold = −(Σ qtyChange SALE per minggu)
  // movement.adjust = Σ qtyChange ADJUST per minggu
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

  // xLine = qty indeks ⌊n/2⌋ dari qty terurut naik   (n genap: median atas)
  // yLine = margin bisnis × 100, 1 desimal
  // y     = margin produk × 100, 1 desimal
  // r     = 5 + √(revenue / maxRevenue) × 13, 1 desimal   (maxRevenue minimal 1)
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
    // lowMargin = getLowMarginProducts(cur, 0.15); margin = profit/revenue < 15%.
    lowMargin: getLowMarginProducts(cur, 0.15).map((p) => ({ name: p.name, margin: p.margin }))
  };
}

export async function getDashboardPageData(businessId: string, tz: BizTz) {
  const T = makeTime(tz);
  // Query independen jalan paralel dalam satu Promise.all; agregasi KPI
  // dihitung di SQL (GROUP BY + SUM) sehingga transfer hanya 1 baris per produk.
  // Agregat harian 60 hari; semua batas hari pakai zona bisnis.
  const sixtyDaysAgo = T.startOfDay(T.addDays(new Date(), -59));
  const [products, grouped, countRows, recentTransactions, dailyRows, restockList, restockCounts] = await Promise.all([
    db
      .select({ id: product.id, name: product.name })
      .from(product)
      .where(eq(product.businessId, businessId)),

    // Agregat all-time per produk dari lapisan Facts.
    queryFactsByProduct(db, businessId, { from: null, to: null }),

    // Jumlah transaksi (bukan baris item) untuk KPI row, bukan card Cost.
    db
      .select({ value: count() })
      .from(transaction)
      .where(eq(transaction.businessId, businessId)),

    // 10 struk terbaru dari lapisan transaksi.
    queryRecentReceipts(businessId),

    // Agregat harian 60 hari dari lapisan Facts.
    queryFactsByDay(db, businessId, { from: sixtyDaysAgo, to: null }, tz),

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

  // Ringkasan per produk + total bisnis dari engine.
  const perProduct: ProductSummary[] = summarizeFacts(grouped, productNames);

  // total = Σ total per produk (asosiatif, sama dengan jumlah semua item).
  const summary = totalsOf(perProduct);

  const topByRevenue = getTopProducts(perProduct, 'revenue', 5);
  const insights = getBusinessInsights(perProduct).slice(0, 3);

  const [{ value: transactionCount }] = countRows;

  // Deret harian 60 hari dari engine (isi 0 untuk hari tanpa transaksi).
  // 30 hari terakhir → tren chart, 30 vs 30 sebelumnya → delta KPI.
  const series60 = fillDailySeries(dailyRows, { from: sixtyDaysAgo, to: new Date(), T });
  const days = series60.map((d) => ({ key: d.key, label: d.label, revenue: d.revenue, profit: d.profit, tx: d.tx }));
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
  // Delta persen tunggal (pecahan → ×100); null tetap null ("baru").
  const pct = (c: number, p: number): number | null => {
    const r = deltaRatio(c, p);
    return r === null ? null : r * 100;
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

export async function getSimulatorPageData(businessId: string, url: URL, tz: BizTz) {
  const range = resolvePeriod(url, tz, new Date(), { default: 'month', allow: ['today', 'week', 'month', 'all', 'custom'] });

  // Baseline per produk dari lapisan Facts: qty/revenue/cost/profit/margin/
  // txCount + facts (diskon kuota + drift). Produk tanpa histori = angka nol.
  const [products, agg] = await Promise.all([
    db.select().from(product).where(eq(product.businessId, businessId)),
    queryFactsByProduct(db, businessId, { from: range.from, to: range.to })
  ]);

  const baselines = products.map((p) => {
    const a = agg.get(p.id);
    const facts = a
      ? { qty: a.qty, gross: a.gross, discount: a.discount, cost: a.cost, discountedQty: a.discountedQty } // arch-allow: field Facts, bukan kolom DB
      : { ...ZERO_FACTS };
    const m = metricsOf(facts);
    return {
      productId: p.id,
      qty: m.qty,
      revenue: m.revenue,
      cost: m.cost,
      profit: m.profit,
      margin: m.margin,
      txCount: a?.txCount ?? 0,
      facts
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

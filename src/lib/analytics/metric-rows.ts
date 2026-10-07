import { avgTicketOf, metricsOf, sumFacts, ZERO_FACTS, type Facts } from './facts';
import { fmtInt, fmtPercent, fmtRupiah } from '../shared/format';
import type { BizTime } from '../shared/time';

export type Metric = 'revenue' | 'profit' | 'margin' | 'qty' | 'tx_count' | 'discount_total' | 'avg_ticket';
export type GroupBy = 'none' | 'product' | 'day' | 'week' | 'month' | 'weekday' | 'hour';
export type RowOrder = 'chronological' | 'desc' | 'asc';

export interface GroupedFacts extends Facts {
  txCount: number;
}

export interface MetricRowsInput {
  metric: Metric;
  groupBy: GroupBy;
  window: { from: Date; to: Date };
  now: Date;
  T: BizTime;
  byDay?: Map<string, GroupedFacts>;
  byHour?: Map<number, GroupedFacts>;
  byProduct?: Map<string, GroupedFacts>;
  productNames?: Map<string, string>;
  totalTxCount?: number;
  order?: RowOrder;
  limit?: number;
}

export interface MetricRow {
  key: string;
  label: string;
  value: number;
  valueText: string;
  shareText?: string;
  occurrences?: number;
  perOccurrenceText?: string;
}

export interface MetricRowsData {
  metric: Metric;
  metricLabel: string;
  groupBy: GroupBy;
  groupLabel: string;
  total: { value: number; valueText: string };
  rows: MetricRow[];
  summary: { best: { label: string; valueText: string } | null; worst: { label: string; valueText: string } | null };
  notes: string[];
  shown: number;
  totalGroups: number;
  truncated: boolean;
}

export type MetricRowsResult = { ok: true; data: MetricRowsData } | { ok: false; code: 'INVALID_ARGS'; message: string };

const ADDITIVE: Metric[] = ['revenue', 'profit', 'qty', 'tx_count', 'discount_total'];

const METRIC_LABEL: Record<Metric, string> = {
  revenue: 'Omzet',
  profit: 'Profit',
  margin: 'Margin',
  qty: 'Unit terjual',
  tx_count: 'Jumlah struk',
  discount_total: 'Total diskon',
  avg_ticket: 'Rata-rata per struk'
};

const GROUP_LABEL: Record<GroupBy, string> = {
  none: 'Total',
  product: 'Per produk',
  day: 'Per hari',
  week: 'Per minggu',
  month: 'Per bulan',
  weekday: 'Per hari dalam seminggu',
  hour: 'Per jam'
};

const SHORT_DAY = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const SHORT_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const WEEKDAY_NAMES = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

// revenue        = gross − discount
// profit         = revenue − cost
// margin         = profit / revenue   (0 bila revenue = 0)
// qty            = Σ quantity
// tx_count       = Σ txCount
// discount_total = Σ discountAmount
// avg_ticket     = avgTicketOf(revenue, txCount)   (0 bila txCount = 0)
function metricValue(metric: Metric, facts: Facts, txCount: number): number {
  switch (metric) {
    case 'revenue':
      return metricsOf(facts).revenue;
    case 'profit':
      return metricsOf(facts).profit;
    case 'margin':
      return metricsOf(facts).margin;
    case 'qty':
      return facts.qty;
    case 'tx_count':
      return txCount;
    case 'discount_total':
      return facts.discount;
    case 'avg_ticket':
      return avgTicketOf(metricsOf(facts).revenue, txCount);
  }
}

function formatValue(metric: Metric, value: number): string {
  switch (metric) {
    case 'revenue':
    case 'profit':
    case 'discount_total':
    case 'avg_ticket':
      return fmtRupiah(value);
    case 'margin':
      return fmtPercent(value);
    case 'qty':
    case 'tx_count':
      return fmtInt(value);
  }
}

function dayLabel(dayKey: string, T: BizTime): string {
  const instant = T.parseDay(dayKey);
  const d = instant ? T.toLocal(instant) : null;
  const name = instant ? SHORT_DAY[T.isoDow(instant) - 1] : '';
  return d ? `${name}, ${d.getUTCDate()} ${SHORT_MONTH[d.getUTCMonth()]}` : dayKey;
}

interface Bucket {
  key: string;
  label: string;
  facts: Facts;
  txCount: number;
  occurrences?: number;
}

function orderBuckets(buckets: Bucket[], order: RowOrder, rank: (b: Bucket) => number): Bucket[] {
  if (order === 'chronological') return buckets;
  const dir = order === 'desc' ? -1 : 1;
  return [...buckets].sort((a, b) => (rank(a) - rank(b)) * dir || a.label.localeCompare(b.label, 'id-ID'));
}

export function buildMetricRows(input: MetricRowsInput): MetricRowsResult {
  const { metric, groupBy, window, now, T } = input;
  const additive = ADDITIVE.includes(metric);
  const order: RowOrder = input.order ?? (groupBy === 'product' ? 'desc' : 'chronological');
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 10);
  const byDay = input.byDay ?? new Map<string, GroupedFacts>();
  const notes: string[] = [];

  if (groupBy === 'none') {
    const facts = sumFacts([...byDay.values()]);
    const tx = [...byDay.values()].reduce((s, r) => s + r.txCount, 0);
    const value = metricValue(metric, facts, tx);
    return {
      ok: true,
      data: {
        metric, metricLabel: METRIC_LABEL[metric], groupBy, groupLabel: GROUP_LABEL[groupBy],
        total: { value, valueText: formatValue(metric, value) },
        rows: [], summary: { best: null, worst: null }, notes, shown: 0, totalGroups: 0, truncated: false
      }
    };
  }

  if (groupBy === 'product') {
    const byProduct = input.byProduct ?? new Map<string, GroupedFacts>();
    const names = input.productNames ?? new Map<string, string>();
    const buckets: Bucket[] = [...byProduct].map(([id, row]) => ({
      key: id,
      label: names.get(id) ?? id,
      facts: row,
      txCount: row.txCount
    }));
    if (order === 'chronological') buckets.sort((a, b) => a.label.localeCompare(b.label, 'id-ID'));
    const totalFacts = sumFacts(buckets.map((b) => b.facts));
    const totalTx = input.totalTxCount ?? buckets.reduce((s, b) => s + b.txCount, 0);
    const total = metric === 'tx_count' ? totalTx : metric === 'avg_ticket' ? avgTicketOf(metricsOf(totalFacts).revenue, totalTx) : metricValue(metric, totalFacts, totalTx);
    if (metric === 'tx_count') notes.push('Satu struk bisa memuat beberapa produk; jumlah per produk tidak dijumlahkan.');
    return finish({ metric, groupBy, total, buckets, order, limit, notes, additive, share: additive && metric !== 'tx_count', occurrences: false });
  }

  if (groupBy === 'hour') {
    const byHour = input.byHour ?? new Map<number, GroupedFacts>();
    const keys = [...byHour.keys()].sort((a, b) => a - b);
    const buckets: Bucket[] = [];
    if (keys.length > 0) {
      for (let h = keys[0]; h <= keys[keys.length - 1]; h++) {
        const row = byHour.get(h);
        buckets.push({
          key: String(h),
          label: `${String(h).padStart(2, '0')}.00–${String(h).padStart(2, '0')}.59`,
          facts: row ?? { ...ZERO_FACTS },
          txCount: row?.txCount ?? 0
        });
      }
    }
    const facts = sumFacts([...byHour.values()]);
    const tx = [...byHour.values()].reduce((s, r) => s + r.txCount, 0);
    notes.push('Hanya jam dalam rentang jam transaksi yang tercatat.');
    return finish({ metric, groupBy, total: metricValue(metric, facts, tx), buckets, order, limit, notes, additive, share: additive, occurrences: false });
  }

  if (groupBy === 'weekday') {
    const perDow: Bucket[] = WEEKDAY_NAMES.map((label, i) => ({ key: String(i + 1), label, facts: { ...ZERO_FACTS }, txCount: 0 }));
    for (const [dayKey, row] of byDay) {
      const instant = T.parseDay(dayKey);
      if (!instant) continue;
      const slot = perDow[T.isoDow(instant) - 1];
      slot.facts = sumFacts([slot.facts, row]);
      slot.txCount += row.txCount;
    }
    const end = Math.min(window.to.getTime(), now.getTime());
    let cursor = T.startOfDay(window.from).getTime();
    const counts = [0, 0, 0, 0, 0, 0, 0];
    while (cursor <= end) {
      counts[T.isoDow(new Date(cursor)) - 1] += 1;
      cursor = T.addDays(new Date(cursor), 1).getTime();
    }
    perDow.forEach((slot, i) => {
      slot.occurrences = counts[i];
    });
    const facts = sumFacts([...byDay.values()]);
    const tx = [...byDay.values()].reduce((s, r) => s + r.txCount, 0);
    if (additive) notes.push('Peringkat memakai rata-rata per hari karena jumlah tiap nama hari dalam periode bisa berbeda.');
    const rank = (b: Bucket) => (additive ? (b.occurrences ? metricValue(metric, b.facts, b.txCount) / b.occurrences : 0) : metricValue(metric, b.facts, b.txCount));
    return finish({ metric, groupBy, total: metricValue(metric, facts, tx), buckets: perDow, order, limit, notes, additive, share: additive, occurrences: additive, rank });
  }

  const fromDay = T.dayKey(window.from);
  const toDay = T.dayKey(window.to);
  const dayCount = Math.round((T.startOfDay(window.to).getTime() - T.startOfDay(window.from).getTime()) / 86_400_000) + 1;

  if (groupBy === 'day') {
    if (dayCount > 31) {
      return { ok: false, code: 'INVALID_ARGS', message: 'Rentang terlalu panjang untuk per hari; pakai per minggu atau per bulan.' };
    }
    const buckets: Bucket[] = [];
    let cursor = T.startOfDay(window.from);
    while (T.dayKey(cursor) <= toDay) {
      const key = T.dayKey(cursor);
      const row = byDay.get(key);
      buckets.push({ key, label: dayLabel(key, T), facts: row ?? { ...ZERO_FACTS }, txCount: row?.txCount ?? 0 });
      cursor = T.addDays(cursor, 1);
    }
    const facts = sumFacts([...byDay.values()]);
    const tx = [...byDay.values()].reduce((s, r) => s + r.txCount, 0);
    return finish({ metric, groupBy, total: metricValue(metric, facts, tx), buckets, order, limit, notes, additive, share: additive, occurrences: false });
  }

  if (groupBy === 'week') {
    const buckets: Bucket[] = [];
    let monday = T.startOfDay(T.addDays(window.from, -(T.isoDow(window.from) - 1)));
    while (T.dayKey(monday) <= toDay) {
      const startKey = T.dayKey(monday);
      const endKey = T.dayKey(T.addDays(monday, 6)) <= toDay ? T.dayKey(T.addDays(monday, 6)) : toDay;
      const factsList: Facts[] = [];
      let tx = 0;
      for (const [dayKey, row] of byDay) {
        if (dayKey >= startKey && dayKey <= endKey && dayKey >= fromDay) {
          factsList.push(row);
          tx += row.txCount;
        }
      }
      const partial = startKey < fromDay || T.dayKey(T.addDays(monday, 6)) > toDay;
      const a = T.toLocal(T.parseDay(startKey)!);
      const b = T.toLocal(T.parseDay(endKey)!);
      const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
      const span = sameMonth
        ? `${a.getUTCDate()}–${b.getUTCDate()} ${SHORT_MONTH[b.getUTCMonth()]}`
        : `${a.getUTCDate()} ${SHORT_MONTH[a.getUTCMonth()]}–${b.getUTCDate()} ${SHORT_MONTH[b.getUTCMonth()]}`;
      buckets.push({
        key: startKey,
        label: `${span}${partial ? ' (sebagian)' : ''}`,
        facts: sumFacts(factsList),
        txCount: tx
      });
      monday = T.addDays(monday, 7);
      if (buckets.length > 26) return { ok: false, code: 'INVALID_ARGS', message: 'Rentang terlalu panjang untuk per minggu; pakai per bulan.' };
    }
    const facts = sumFacts([...byDay.values()]);
    const tx = [...byDay.values()].reduce((s, r) => s + r.txCount, 0);
    return finish({ metric, groupBy, total: metricValue(metric, facts, tx), buckets, order, limit, notes, additive, share: additive, occurrences: false });
  }

  const months: { key: string; label: string; partial: boolean }[] = [];
  const start = T.toLocal(window.from);
  const stop = T.toLocal(window.to);
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  while (y < stop.getUTCFullYear() || (y === stop.getUTCFullYear() && m <= stop.getUTCMonth())) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    const firstKey = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const lastKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    months.push({ key, label: `${SHORT_MONTH[m]} ${y}${firstKey < fromDay || lastKey > toDay ? ' (sebagian)' : ''}`, partial: firstKey < fromDay || lastKey > toDay });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    if (months.length > 12) return { ok: false, code: 'INVALID_ARGS', message: 'Rentang terlalu panjang untuk per bulan; persempit rentang.' };
  }
  const buckets: Bucket[] = months.map(({ key, label }) => {
    const factsList: Facts[] = [];
    let tx = 0;
    for (const [dayKey, row] of byDay) {
      if (dayKey.startsWith(key)) {
        factsList.push(row);
        tx += row.txCount;
      }
    }
    return { key, label, facts: sumFacts(factsList), txCount: tx };
  });
  const facts = sumFacts([...byDay.values()]);
  const tx = [...byDay.values()].reduce((s, r) => s + r.txCount, 0);
  return finish({ metric, groupBy, total: metricValue(metric, facts, tx), buckets, order, limit, notes, additive, share: additive, occurrences: false });
}

function finish(args: {
  metric: Metric;
  groupBy: GroupBy;
  total: number;
  buckets: Bucket[];
  order: RowOrder;
  limit: number;
  notes: string[];
  additive: boolean;
  share: boolean;
  occurrences: boolean;
  rank?: (b: Bucket) => number;
}): MetricRowsResult {
  const { metric, groupBy, total, buckets, order, limit, notes, additive, share, occurrences } = args;
  const rank = args.rank ?? ((b) => metricValue(metric, b.facts, b.txCount));
  const ranked = order === 'chronological' ? buckets : orderBuckets(buckets, order, rank).slice(0, limit);
  const rows: MetricRow[] = ranked.map((b) => {
    const value = metricValue(metric, b.facts, b.txCount);
    const row: MetricRow = { key: b.key, label: b.label, value, valueText: formatValue(metric, value) };
    if (share && total !== 0) row.shareText = fmtPercent(value / total);
    else if (share) row.shareText = fmtPercent(0);
    if (occurrences && additive) {
      const per = b.occurrences ? value / b.occurrences : 0;
      row.occurrences = b.occurrences;
      row.perOccurrenceText = formatValue(metric, per);
    }
    return row;
  });
  const ordered = orderBuckets(buckets, 'desc', rank);
  const pick = (b: Bucket) => ({ label: b.label, valueText: formatValue(metric, metricValue(metric, b.facts, b.txCount)) });
  return {
    ok: true,
    data: {
      metric, metricLabel: METRIC_LABEL[metric], groupBy, groupLabel: GROUP_LABEL[groupBy],
      total: { value: total, valueText: formatValue(metric, total) },
      rows,
      summary: { best: rows.length >= 2 ? pick(ordered[0]) : null, worst: rows.length >= 2 ? pick(ordered[ordered.length - 1]) : null },
      notes,
      shown: rows.length,
      totalGroups: buckets.length,
      truncated: rows.length < buckets.length
    }
  };
}

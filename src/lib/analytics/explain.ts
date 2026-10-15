import { fmtInt, fmtPercent, fmtQty, fmtRupiah, fmtDeltaPct, fmtPoin } from '../shared/format';
import { unitDiscount } from '../discount';
import { DEMAND_ELASTICITY, DEMAND_MAX_FACTOR, PRICE_RANGE_LIMIT_PCT, optimalEffectivePrice } from '../simulation';
import type { SimInput, SimResult } from '../simulation';

export interface ExplainStep {
  label: string;
  expr: string;
  result: string;
  approx: boolean;
}

export interface Explain {
  title: string;
  formula: string;
  main: { expr: string; result: string; approx: boolean } | null;
  parts: ExplainStep[];
  versus: ExplainStep | null;
  notes: string[];
}

export interface SimExplain {
  revenue: Explain;
  profit: Explain;
  margin: Explain;
  qty: Explain;
  unitProfit: Explain;
  breakEven: Explain;
  maxDiscount: Explain;
  maxDrop: Explain;
  peak: Explain;
  rows: { actual: Explain; statusQuo: Explain };
}

type Levers = NonNullable<SimInput['levers']>;

function deltaStep(label: string, base: number, sim: number, delta: number | null, fmt: (v: number) => string): ExplainStep {
  const expr = base === 0 ? `sekarang = ${fmt(0)}` : `(${fmt(sim)} − ${fmt(base)}) ÷ ${fmt(Math.abs(base))}`;
  return { label, expr, result: fmtDeltaPct(delta), approx: false };
}

function fmt3(value: number): string {
  return (Math.round(value * 1000) / 1000).toFixed(3).replace('.', ',');
}

function discountPart(r: SimResult, levers: Levers): ExplainStep {
  const s = r.simulated;
  const d = levers.discount;
  if (d?.kind === 'percent') {
    const perUnit = unitDiscount(r.unit.listPrice, d.pct);
    const covered = d.units === undefined ? s.qty : Math.min(s.qty, d.units);
    return { label: 'diskon', expr: `${fmtQty(covered)} unit × ${fmtRupiah(perUnit)}`, result: fmtRupiah(s.discount), approx: !Number.isInteger(covered) };
  }
  return { label: 'diskon', expr: `${fmtRupiah(s.gross)} × ${fmtPercent(r.actual.discountRate)}`, result: fmtRupiah(s.discount), approx: true };
}

function explainRevenue(r: SimResult, levers: Levers): Explain {
  const s = r.simulated;
  const fractional = !Number.isInteger(r.qty.simulated);
  const grossPart: ExplainStep = {
    label: 'gross',
    expr: `${fmtQty(s.qty)} unit × ${fmtRupiah(r.unit.listPrice)}`,
    result: fmtRupiah(s.gross),
    approx: fractional
  };
  const dPart = discountPart(r, levers);
  const notes: string[] = [];
  if (fractional) notes.push('Qty pecahan dari model permintaan; ditampilkan dibulatkan 1 desimal.');
  if (dPart.approx && levers.discount?.kind !== 'percent') notes.push('Diskon mengikuti rasio diskon histori; rasio ditampilkan dibulatkan 0,1%.');
  return {
    title: 'Revenue simulasi',
    formula: 'revenue = gross − diskon',
    main: { expr: `${fmtRupiah(s.gross)} − ${fmtRupiah(s.discount)}`, result: fmtRupiah(s.revenue), approx: false },
    parts: [grossPart, dPart],
    versus: r.qty.baseline === 0 ? null : deltaStep('(simulasi − sekarang) ÷ |sekarang|', r.statusQuo.revenue, s.revenue, r.impact.vsStatusQuo.revenue, fmtRupiah),
    notes
  };
}

function explainProfit(r: SimResult, levers: Levers): Explain {
  const s = r.simulated;
  const fractional = !Number.isInteger(r.qty.simulated);
  return {
    title: 'Profit simulasi',
    formula: 'profit = revenue − biaya modal',
    main: { expr: `${fmtRupiah(s.revenue)} − ${fmtRupiah(s.cost)}`, result: fmtRupiah(s.profit), approx: false },
    parts: [
      {
        label: 'biaya modal',
        expr: `${fmtQty(s.qty)} unit × ${fmtRupiah(r.unit.cost)}`,
        result: fmtRupiah(s.cost),
        approx: fractional
      }
    ],
    versus: r.qty.baseline === 0 ? null : deltaStep('(simulasi − sekarang) ÷ |sekarang|', r.statusQuo.profit, s.profit, r.impact.vsStatusQuo.profit, fmtRupiah),
    notes: fractional ? ['Qty pecahan dari model permintaan; ditampilkan dibulatkan 1 desimal.'] : []
  };
}

function explainMargin(r: SimResult): Explain {
  const s = r.simulated;
  if (s.revenue === 0) {
    return {
      title: 'Margin simulasi',
      formula: 'margin = profit ÷ revenue',
      main: { expr: 'revenue = Rp0', result: '0,0%', approx: false },
      parts: [],
      versus: null,
      notes: ['Margin 0 bila revenue 0.']
    };
  }
  return {
    title: 'Margin simulasi',
    formula: 'margin = profit ÷ revenue',
    main: { expr: `${fmtRupiah(s.profit)} ÷ ${fmtRupiah(s.revenue)}`, result: fmtPercent(s.margin), approx: true },
    parts: [],
    versus:
      r.qty.baseline === 0
        ? null
        : {
            label: 'selisih = margin simulasi − margin sekarang',
            expr: `${fmtPercent(s.margin)} − ${fmtPercent(r.statusQuo.margin)}`,
            result: fmtPoin(r.impact.vsStatusQuo.marginPoints),
            approx: true
          },
    notes: []
  };
}

function volumePct(levers: Levers): number {
  return levers.volume?.kind === 'pct' ? levers.volume.pct : 0;
}

function explainQty(r: SimResult, levers: Levers): Explain {
  const versus =
    r.qty.baseline === 0
      ? null
      : { ...deltaStep('(simulasi − sekarang) ÷ sekarang', r.qty.baseline, r.qty.simulated, r.impact.vsStatusQuo.qty, fmtQty), label: '(simulasi − sekarang) ÷ sekarang' };
  if (levers.volume?.kind === 'override') {
    return {
      title: 'Unit terjual',
      formula: 'qty = angka manual',
      main: null,
      parts: [],
      versus,
      notes: [`Qty diisi manual: ${fmtInt(levers.volume.qty)} unit; model permintaan tidak dipakai.`]
    };
  }
  if (r.demand.applied) {
    const e = r.demand.e;
    const notes: string[] = ['Qty pecahan dari model permintaan; ditampilkan dibulatkan 1 desimal.'];
    if (r.demand.capped) notes.push(`Faktor dibatasi maksimal ${DEMAND_MAX_FACTOR}×.`);
    return {
      title: 'Unit terjual',
      formula: 'qty = qty sekarang × faktor × (1 + volume%)',
      main: {
        expr: `${fmtInt(r.qty.baseline)} × ${fmt3(r.demand.factor)} × (1 + ${volumePct(levers)}%)`,
        result: fmtQty(r.qty.simulated),
        approx: true
      },
      parts: [
        { label: 'rasio harga efektif', expr: 'harga efektif simulasi ÷ harga efektif sekarang', result: fmt3(r.demand.ratio), approx: false },
        { label: 'faktor permintaan', expr: `rasio^(−${fmt3(e)})`, result: fmt3(r.demand.factor), approx: false }
      ],
      versus,
      notes
    };
  }
  return {
    title: 'Unit terjual',
    formula: 'qty = qty sekarang × (1 + volume%)',
    main: {
      expr: `${fmtInt(r.qty.baseline)} × (1 + ${volumePct(levers)}%)`,
      result: fmtQty(r.qty.simulated),
      approx: false
    },
    parts: [],
    versus,
    notes: []
  };
}

function explainUnitProfit(r: SimResult): Explain {
  const s = r.simulated;
  const avg = s.avgNetPrice;
  const approx = !Number.isInteger(avg);
  return {
    title: 'Laba per unit simulasi',
    formula: 'laba/unit = harga efektif rata-rata − modal/unit',
    main: { expr: `${fmtRupiah(avg)} − ${fmtRupiah(r.unit.cost)}`, result: fmtRupiah(r.unit.unitProfit), approx },
    parts: [
      {
        label: 'harga efektif rata-rata',
        expr: `${fmtRupiah(s.revenue)} ÷ ${fmtQty(s.qty)} unit`,
        result: fmtRupiah(avg),
        approx
      }
    ],
    versus: null,
    notes: r.qty.simulated === 0 ? ['Qty simulasi 0, harga efektif dianggap Rp0.'] : []
  };
}

function explainBreakEven(r: SimResult): Explain {
  const q = r.breakEvenQty;
  const base: Explain = {
    title: 'Qty impas',
    formula: 'qty impas = qty terkecil dengan profit ≥ profit kondisi sekarang',
    main: null,
    parts: [
      { label: 'target profit', expr: 'profit kondisi sekarang', result: fmtRupiah(r.statusQuo.profit), approx: false },
      { label: 'laba/unit simulasi', expr: 'harga efektif rata-rata − modal/unit', result: fmtRupiah(r.unit.unitProfit), approx: false }
    ],
    versus: null,
    notes: ['Dihitung dengan pencarian pada fungsi profit yang sama dengan simulasi; bisa selisih 1 unit dari pembagian sederhana.']
  };
  if (q === null) {
    return {
      ...base,
      main: { expr: 'qty impas', result: 'Tidak impas', approx: false },
      notes: [...base.notes, 'Harga efektif tidak melebihi modal; tiap unit tidak menambah profit.']
    };
  }
  if (q === 0) {
    return {
      ...base,
      main: { expr: 'qty impas', result: '-', approx: false },
      notes: [...base.notes, 'Profit kondisi sekarang sudah ≤ 0, jadi tak ada target impas.']
    };
  }
  return { ...base, main: { expr: 'qty impas', result: `${fmtInt(q)} unit`, approx: false } };
}

function explainMaxDiscount(r: SimResult): Explain {
  const p = r.maxDiscountPct;
  const base: Explain = {
    title: 'Diskon maks sebelum rugi',
    formula: 'diskon maks = persen terbesar (0..100) dengan harga − pembulatan(harga × persen) ≥ modal',
    main: null,
    parts: [],
    versus: null,
    notes: []
  };
  if (p === null) {
    return { ...base, main: { expr: 'diskon maks', result: '-', approx: false }, notes: ['Harga jual 0, diskon maks tidak bermakna.'] };
  }
  const effAt = r.unit.listPrice - unitDiscount(r.unit.listPrice, p);
  const parts: ExplainStep[] = [
    {
      label: `harga efektif pada ${p}%`,
      expr: `${fmtRupiah(r.unit.listPrice)} − ${fmtRupiah(unitDiscount(r.unit.listPrice, p))}`,
      result: fmtRupiah(effAt),
      approx: false
    },
    { label: 'modal/unit', expr: 'harga modal produk', result: fmtRupiah(r.unit.cost), approx: false }
  ];
  if (p < 100) {
    const effNext = r.unit.listPrice - unitDiscount(r.unit.listPrice, p + 1);
    parts.push({
      label: `pada ${p + 1}%`,
      expr: `${fmtRupiah(r.unit.listPrice)} − ${fmtRupiah(unitDiscount(r.unit.listPrice, p + 1))}`,
      result: fmtRupiah(effNext),
      approx: false
    });
  }
  return { ...base, main: { expr: 'diskon maks', result: `${p}%`, approx: false }, parts };
}

export function maxDropText(r: SimResult): string {
  const d = r.maxVolumeDrop;
  if (d === null) return '-';
  return d >= 0 ? `${fmtPercent(d)} dari ${fmtInt(r.qty.baseline)} unit` : `harus naik ${fmtPercent(-d)}`;
}

function explainMaxDrop(r: SimResult): Explain {
  const be = r.breakEvenQty;
  return {
    title: 'Penjualan boleh turun maks',
    formula: 'penjualan boleh turun = 1 − qty impas ÷ qty sekarang',
    main: {
      expr: be === null ? '1 − qty impas ÷ qty sekarang' : `1 − ${fmtInt(be)} ÷ ${fmtInt(r.qty.baseline)}`,
      result: maxDropText(r),
      approx: true
    },
    parts: [],
    versus: null,
    notes: (r.maxVolumeDrop ?? 0) < 0 ? ['Negatif berarti penjualan harus naik agar profit menyamai kondisi sekarang.'] : []
  };
}

function explainPeak(r: SimResult, levers: Levers): Explain {
  const base: Explain = {
    title: 'Harga paling untung dalam rentang',
    formula: `harga efektif optimal = modal × e ÷ (e − 1), dibatasi ±${PRICE_RANGE_LIMIT_PCT}% harga efektif sekarang dan faktor permintaan maks ${DEMAND_MAX_FACTOR}×`,
    main: null,
    parts: [],
    versus: null,
    notes: []
  };
  if (r.peak === null) {
    const reason = peakEmptyReason(r, levers);
    return { ...base, notes: reason ? [reason] : [] };
  }
  const e = String(DEMAND_ELASTICITY).replace('.', ',');
  return {
    ...base,
    main: {
      expr: `${fmtRupiah(r.unit.cost)} × ${e} ÷ (${e} − 1)`,
      result: fmtRupiah(optimalEffectivePrice(r.unit.cost, DEMAND_ELASTICITY)),
      approx: false
    },
    parts: [
      {
        label: 'harga list optimal',
        expr: 'harga efektif optimal (dibatasi) ÷ (1 − diskon)',
        result: fmtRupiah(r.peak.price),
        approx: false
      },
      { label: 'profit di harga itu', expr: 'profit model pada harga list optimal', result: fmtRupiah(r.peak.profit), approx: false }
    ],
    notes: ['Bila di luar rentang, dipakai batas rentang.']
  };
}

export function peakEmptyReason(r: SimResult, levers: Levers): string {
  if (levers.volume?.kind === 'override') return 'qty manual';
  if (r.qty.baseline === 0) return 'tidak ada histori';
  if (r.flags.includes('QUOTA_DEMAND_IGNORED')) return 'diskon berkuota';
  return '';
}

export function explainSim(r: SimResult, levers: Levers): SimExplain {
  return {
    revenue: explainRevenue(r, levers),
    profit: explainProfit(r, levers),
    margin: explainMargin(r),
    qty: explainQty(r, levers),
    unitProfit: explainUnitProfit(r),
    breakEven: explainBreakEven(r),
    maxDiscount: explainMaxDiscount(r),
    maxDrop: explainMaxDrop(r),
    peak: explainPeak(r, levers),
    rows: {
      actual: {
        title: 'Aktual (periode)',
        formula: 'Hasil transaksi nyata pada rentang tanggal terpilih',
        main: null,
        parts: [],
        versus: null,
        notes: []
      },
      statusQuo: {
        title: 'Kondisi sekarang',
        formula: 'qty histori × harga jual dan modal produk sekarang; diskon mengikuti rasio diskon histori',
        main: null,
        parts: [],
        versus: null,
        notes: []
      }
    }
  };
}

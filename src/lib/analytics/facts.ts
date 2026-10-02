// Kamus tunggal angka (§3). Murni + isomorfik: jalan di server maupun
// browser, jadi tanpa drizzle-orm/$env/$app dan tanpa jam sistem
// (waktu selalu masuk lewat parameter).
// Semua uang = integer Rupiah; semua rasio = pecahan (0.25 = 25%).
// Pembulatan/format hanya di UI.
import type { TransactionItemLike } from './core';

// Hanya field yang BISA DIJUMLAHKAN lintas baris/periode.
export interface Facts {
  qty: number; // Σ quantity
  gross: number; // Σ qty × priceAtSale
  discount: number; // Σ discountAmount (snapshot, tak pernah dihitung ulang)
  cost: number; // Σ qty × costAtSale
  discountedQty: number; // Σ discountedQty
}

export const ZERO_FACTS: Facts = { qty: 0, gross: 0, discount: 0, cost: 0, discountedQty: 0 };

export function addFacts(a: Facts, b: Facts): Facts {
  return {
    qty: a.qty + b.qty,
    gross: a.gross + b.gross,
    discount: a.discount + b.discount,
    cost: a.cost + b.cost,
    discountedQty: a.discountedQty + b.discountedQty
  };
}

export function sumFacts(list: Facts[]): Facts {
  return list.reduce(addFacts, { ...ZERO_FACTS });
}

// Jalur row-level (tes, data kecil). Lawannya: agregat SQL factColumns().
export function factsOfItem(i: TransactionItemLike): Facts {
  return {
    qty: i.quantity,
    gross: i.quantity * i.priceAtSale,
    discount: i.discountAmount ?? 0,
    cost: i.quantity * i.costAtSale,
    discountedQty: i.discountedQty ?? 0
  };
}

export interface Metrics {
  qty: number;
  gross: number;
  discount: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  discountRate: number;
  avgGrossPrice: number;
  avgNetPrice: number;
  avgCost: number;
}

// SATU-SATUNYA tempat rumus turunan §3. Semua caller (loader, simulasi,
// ringkasan) wajib lewat sini, bukan menghitung manual.
export function metricsOf(f: Facts): Metrics {
  const revenue = f.gross - f.discount;
  const profit = revenue - f.cost;
  return {
    qty: f.qty,
    gross: f.gross,
    discount: f.discount,
    revenue,
    cost: f.cost,
    profit,
    margin: revenue === 0 ? 0 : profit / revenue,
    discountRate: f.gross === 0 ? 0 : f.discount / f.gross,
    avgGrossPrice: f.qty === 0 ? 0 : f.gross / f.qty,
    avgNetPrice: f.qty === 0 ? 0 : revenue / f.qty,
    avgCost: f.qty === 0 ? 0 : f.cost / f.qty
  };
}

// Revenue bersih satu baris = qty × harga − diskon (0 bila tanpa diskon).
// discountAmount null (baris lama) diperlakukan sama dengan undefined.
export function lineNetOf(i: {
  quantity: number;
  priceAtSale: number;
  discountAmount?: number | null;
}): number {
  return i.quantity * i.priceAtSale - (i.discountAmount ?? 0);
}

// Total struk: subtotal = Σ qty×harga normal; total = subtotal − Σ diskon.
export function receiptTotals(
  items: { quantity: number; priceAtSale: number; discountAmount: number }[]
): { subtotal: number; discountTotal: number; total: number } {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.priceAtSale, 0);
  const discountTotal = items.reduce((s, i) => s + i.discountAmount, 0);
  return { subtotal, discountTotal, total: subtotal - discountTotal };
}

// Delta TUNGGAL (pecahan; null = "dari nol").
// prev = 0 → cur = 0 ? 0 : null. Penyebut |prev| biar basis negatif benar
// tandanya: −100 → −50 = +0.5 (membaik), bukan −0.5.
export function deltaRatio(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return (cur - prev) / Math.abs(prev);
}

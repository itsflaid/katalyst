import type { ProductSummary } from './core';

// Ambang tipis tunggal; badge Produk memakainya dalam satuan persen.
export const MARGIN_THIN = 0.15;
export const MARGIN_THIN_PCT = Math.round(MARGIN_THIN * 100);

// margin = profit / revenue   (0 bila revenue = 0)
export function calculateMargin(revenue: number, profit: number): number {
  if (revenue === 0) return 0;
  return profit / revenue;
}

export function getLowMarginProducts(summaries: ProductSummary[], marginThreshold = MARGIN_THIN): ProductSummary[] {
  return summaries.filter((p) => p.margin < marginThreshold);
}

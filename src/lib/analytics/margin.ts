import type { ProductSummary } from './core';

// margin = profit / revenue   (0 bila revenue = 0)
export function calculateMargin(revenue: number, profit: number): number {
    if (revenue === 0) return 0;
    return profit / revenue;
}

export function getLowMarginProducts(
    summaries: ProductSummary[],
    marginThreshold = 0.15
): ProductSummary[] {
    return summaries.filter((p) => p.margin < marginThreshold);
}

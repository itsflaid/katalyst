export interface TransactionItemLike {
    productId: string;
    quantity: number;
    priceAtSale: number;
    costAtSale: number;
}

export interface ProductSummary {
    productId: string;
    name: string;
    quantitySold: number;
    revenue: number;
    cost: number;
    profit: number;
    margin: number; 
}

export interface BusinessSummary {
    revenue: number;
    cost: number;
    profit: number;
    margin: number;
}

export type InsightType =
    | "high_revenue_low_profit"
    | "popular_low_margin"
    | "high_margin_low_demand";

export interface BusinessInsight {
    type: InsightType;
    productId: string;
    productName: string;
    message: string;
}

export interface PeriodComparison {
    current: BusinessSummary;
    previous: BusinessSummary;
    change: {
        revenueChangePercent: number;
        profitChangePercent: number;
        marginChangePoints: number;
    };
}

export interface ProductPeriodComparison {
    productId: string;
    name: string;
    current: ProductSummary;
    previous: ProductSummary | null;
    change: {
        quantityChangePercent: number;
        revenueChangePercent: number;
        profitChangePercent: number;
        marginChangePoints: number;
    };
}

// Perhitungan dasar

export function calculateRevenue(items: TransactionItemLike[]): number {
    return items.reduce((sum, i) => sum + i.quantity * i.priceAtSale, 0);
}

export function calculateCost(items: TransactionItemLike[]): number {
    return items.reduce((sum, i) => sum + i.quantity * i.costAtSale, 0);
}

export function calculateProfit(items: TransactionItemLike[]): number {
    return calculateRevenue(items) - calculateCost(items);
}

/** Margin = profit / revenue. Revenue 0 -> margin 0 (bukan NaN/Infinity). */
export function calculateMargin(revenue: number, profit: number): number {
    if (revenue === 0) return 0;
    return profit / revenue;
}

export function getBusinessSummary(items: TransactionItemLike[]): BusinessSummary {
    const revenue = calculateRevenue(items);
    const cost = calculateCost(items);
    const profit = revenue - cost;
    return { revenue, cost, profit, margin: calculateMargin(revenue, profit) };
}

// Per-produk


export function summarizeByProduct(
    items: TransactionItemLike[],
    productNames: Record<string, string>
): ProductSummary[] {
    const agg = new Map<string, { quantitySold: number; revenue: number; cost: number }>();

    for (const item of items) {
        const current = agg.get(item.productId) ?? { quantitySold: 0, revenue: 0, cost: 0 };
        current.quantitySold += item.quantity;
        current.revenue += item.quantity * item.priceAtSale;
        current.cost += item.quantity * item.costAtSale;
        agg.set(item.productId, current);
    }

    return Array.from(agg.entries()).map(([productId, a]) => {
        const profit = a.revenue - a.cost;
        return {
            productId,
            name: productNames[productId] ?? "Produk tidak dikenal",
            quantitySold: a.quantitySold,
            revenue: a.revenue,
            cost: a.cost,
            profit,
            margin: calculateMargin(a.revenue, profit),
        };
    });
}

export function getProductPerformance(
    productId: string,
    productName: string,
    items: TransactionItemLike[]
): ProductSummary {
    const filtered = items.filter((i) => i.productId === productId);
    const revenue = calculateRevenue(filtered);
    const cost = calculateCost(filtered);
    const profit = revenue - cost;
    const quantitySold = filtered.reduce((sum, i) => sum + i.quantity, 0);

    return {
        productId,
        name: productName,
        quantitySold,
        revenue,
        cost,
        profit,
        margin: calculateMargin(revenue, profit),
    };
}

export function getTopProducts(
    summaries: ProductSummary[],
    by: "revenue" | "profit" | "quantitySold" = "revenue",
    limit = 5
): ProductSummary[] {
    return [...summaries].sort((a, b) => b[by] - a[by]).slice(0, limit);
}

export function getLowMarginProducts(
    summaries: ProductSummary[],
    marginThreshold = 0.15
): ProductSummary[] {
    return summaries.filter((p) => p.margin < marginThreshold);
}

// Insight otomatis

const INSIGHT_RULES = {
    highRevenueLowProfit: { revenueShareMin: 0.2, profitShareMax: 0.1 },
    popularLowMargin: { topNByQuantity: 3, marginRatioMax: 0.7 },
    highMarginLowDemand: { marginRatioMin: 1.3 },
};

export function getBusinessInsights(summaries: ProductSummary[]): BusinessInsight[] {
    if (summaries.length === 0) return [];

    const totalRevenue = summaries.reduce((s, p) => s + p.revenue, 0);
    const totalProfit = summaries.reduce((s, p) => s + p.profit, 0);
    const avgMargin = totalRevenue === 0 ? 0 : totalProfit / totalRevenue;

    const byQuantityDesc = [...summaries].sort((a, b) => b.quantitySold - a.quantitySold);
    const insights: BusinessInsight[] = [];

    for (const p of summaries) {
        const revenueShare = totalRevenue === 0 ? 0 : p.revenue / totalRevenue;
        const profitShare = totalProfit === 0 ? 0 : p.profit / totalProfit;
        const qtyRank = byQuantityDesc.findIndex((x) => x.productId === p.productId);

        // Rule 1: omzet besar, kontribusi profit kecil.
        if (
            revenueShare > INSIGHT_RULES.highRevenueLowProfit.revenueShareMin &&
            profitShare < INSIGHT_RULES.highRevenueLowProfit.profitShareMax
        ) {
            insights.push({
                type: "high_revenue_low_profit",
                productId: p.productId,
                productName: p.name,
                message: `${p.name} menyumbang ${(revenueShare * 100).toFixed(0)}% omzet tapi cuma ${(profitShare * 100).toFixed(0)}% total profit. Pertimbangkan evaluasi harga atau biaya pengadaan.`,
            });
        }

        // Rule 2: laris (top-N by qty) tapi margin di bawah rata-rata.
        const isTopByQuantity = qtyRank < INSIGHT_RULES.popularLowMargin.topNByQuantity;
        if (
            isTopByQuantity &&
            avgMargin > 0 &&
            p.margin < avgMargin * INSIGHT_RULES.popularLowMargin.marginRatioMax
        ) {
            insights.push({
                type: "popular_low_margin",
                productId: p.productId,
                productName: p.name,
                message: `${p.name} laris (top ${INSIGHT_RULES.popularLowMargin.topNByQuantity} penjualan) tapi marginnya cuma ${(p.margin * 100).toFixed(0)}%, di bawah rata-rata bisnis. Kenaikan harga kecil berpotensi menaikkan profit tanpa perlu menambah volume.`,
            });
        }

        // Rule 3: margin tinggi tapi demand rendah (bottom half by qty).
        const isBottomHalfByQuantity = qtyRank >= Math.ceil(summaries.length / 2);
        if (
            isBottomHalfByQuantity &&
            avgMargin > 0 &&
            p.margin > avgMargin * INSIGHT_RULES.highMarginLowDemand.marginRatioMin
        ) {
            insights.push({
                type: "high_margin_low_demand",
                productId: p.productId,
                productName: p.name,
                message: `${p.name} punya margin tinggi (${(p.margin * 100).toFixed(0)}%) tapi demand-nya rendah. Pertimbangkan promosi, bukan menambah stok.`,
            });
        }
    }

    return insights;
}

// ---------------------------------------------------------------------------
// Perbandingan periode (buat Copilot jawab "kenapa berubah", bukan cuma
// "kondisi sekarang"). Dipakai bareng getBusinessSummary/summarizeByProduct:
// caller yang tanggung jawab misahin currentItems vs previousItems by tanggal.
// ---------------------------------------------------------------------------

/** Persen perubahan (a vs b relatif ke b). Baseline 0 -> 0 (bukan NaN/Infinity). */
function percentChange(current: number, previous: number): number {
    if (previous === 0) return 0;
    return (current - previous) / previous;
}

export function compareBusinessPeriods(
    currentItems: TransactionItemLike[],
    previousItems: TransactionItemLike[]
): PeriodComparison {
    const current = getBusinessSummary(currentItems);
    const previous = getBusinessSummary(previousItems);

    return {
        current,
        previous,
        change: {
            revenueChangePercent: percentChange(current.revenue, previous.revenue),
            profitChangePercent: percentChange(current.profit, previous.profit),
            marginChangePoints: current.margin - previous.margin,
        },
    };
}

/**
 * Bandingin performa per produk antar dua periode. Produk yang cuma muncul
 * di currentSummaries (baru laku periode ini) tetap masuk hasil dengan
 * previous = null dan change = 0 di semua field, supaya caller nggak perlu
 * null-check manual buat setiap field angka.
 */
export function compareProductPeriods(
    currentSummaries: ProductSummary[],
    previousSummaries: ProductSummary[]
): ProductPeriodComparison[] {
    const previousById = new Map(previousSummaries.map((p) => [p.productId, p]));

    return currentSummaries.map((curr) => {
        const prev = previousById.get(curr.productId) ?? null;

        if (!prev) {
            return {
                productId: curr.productId,
                name: curr.name,
                current: curr,
                previous: null,
                change: {
                    quantityChangePercent: 0,
                    revenueChangePercent: 0,
                    profitChangePercent: 0,
                    marginChangePoints: 0,
                },
            };
        }

        return {
            productId: curr.productId,
            name: curr.name,
            current: curr,
            previous: prev,
            change: {
                quantityChangePercent: percentChange(curr.quantitySold, prev.quantitySold),
                revenueChangePercent: percentChange(curr.revenue, prev.revenue),
                profitChangePercent: percentChange(curr.profit, prev.profit),
                marginChangePoints: curr.margin - prev.margin,
            },
        };
    });
}

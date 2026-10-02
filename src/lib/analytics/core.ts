import { addFacts, factsOfItem, metricsOf, sumFacts } from './facts';
import type { Facts } from './facts';
export interface TransactionItemLike {
    productId: string;
    quantity: number;
    priceAtSale: number;
    costAtSale: number;
    discountAmount?: number;
    discountedQty?: number;
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

function foldItems(items: TransactionItemLike[]): Facts {
    return sumFacts(items.map(factsOfItem));
}

export function calculateRevenue(items: TransactionItemLike[]): number {
    return metricsOf(foldItems(items)).revenue;
}

export function calculateCost(items: TransactionItemLike[]): number {
    return metricsOf(foldItems(items)).cost;
}

export function calculateProfit(items: TransactionItemLike[]): number {
    return metricsOf(foldItems(items)).profit;
}

export function getBusinessSummary(items: TransactionItemLike[]): BusinessSummary {
    const m = metricsOf(foldItems(items));

    return { revenue: m.revenue, cost: m.cost, profit: m.profit, margin: m.margin };
}

export function summarizeByProduct(
    items: TransactionItemLike[],
    productNames: Record<string, string>
): ProductSummary[] {
    const agg = new Map<string, Facts>();

    for (const item of items) {
        const cur = agg.get(item.productId);
        agg.set(item.productId, cur ? addFacts(cur, factsOfItem(item)) : factsOfItem(item));
    }

    return Array.from(agg.entries()).map(([productId, f]) => {
        const m = metricsOf(f);

        return {
            productId,
            name: productNames[productId] ?? "Produk tidak dikenal",
            quantitySold: m.qty,
            revenue: m.revenue,
            cost: m.cost,
            profit: m.profit,
            margin: m.margin,
        };
    });
}

export function getProductPerformance(
    productId: string,
    productName: string,
    items: TransactionItemLike[]
): ProductSummary {
    const filtered = items.filter((i) => i.productId === productId);
    const m = metricsOf(foldItems(filtered));
    const quantitySold = filtered.reduce((sum, i) => sum + i.quantity, 0);

    return {
        productId,
        name: productName,
        quantitySold,
        revenue: m.revenue,
        cost: m.cost,
        profit: m.profit,
        margin: m.margin,
    };
}

export function getTopProducts(
    summaries: ProductSummary[],
    by: "revenue" | "profit" | "quantitySold" = "revenue",
    limit = 5
): ProductSummary[] {
    return [...summaries].sort((a, b) => b[by] - a[by]).slice(0, limit);
}

export type Quadrant = "bintang" | "laris-tipis" | "margin-kurang-laku" | "evaluasi";

export function quadrantOf(qty: number, margin: number, xThreshold: number, yThreshold: number): Quadrant {
    if (qty >= xThreshold && margin >= yThreshold) return "bintang";
    if (qty >= xThreshold) return "laris-tipis";
    if (margin >= yThreshold) return "margin-kurang-laku";
    return "evaluasi";
}

const INSIGHT_RULES = {
    highRevenueLowProfit: { revenueShareMin: 0.2, profitShareMax: 0.1 },
    popularLowMargin: { topNByQuantity: 3, marginRatioMax: 0.7 },
    highMarginLowDemand: { marginRatioMin: 1.3 },
};

// revenueShare = revenue / totalRevenue
// profitShare  = profit / totalProfit
// avgMargin    = totalProfit / totalRevenue   (0 bila totalRevenue = 0)
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

        // Insight 1: Omzet tinggi (>20%) tetapi kontribusi profit rendah (<10%).
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

        // Insight 2: Produk top 3 laris tetapi margin di bawah 70% rata-rata bisnis.
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

        // Insight 3: Margin tinggi (>130% rata-rata) tetapi volume penjualan rendah.
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

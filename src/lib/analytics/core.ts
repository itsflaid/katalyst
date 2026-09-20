import { calculateMargin } from './margin';

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

// ---------------------------------------------------------------------------
// Matriks Volume vs Margin (Fase 5): kuadran tiap produk relatif ke ambang.
// - 'bintang': laku & margin baik (qty >= ambang, margin >= ambang)
// - 'laris-tipis': laris tapi margin tipis
// - 'margin-kurang-laku': margin bagus tapi kurang laku
// - 'evaluasi': dua-duanya di bawah ambang
// ---------------------------------------------------------------------------

export type Quadrant = "bintang" | "laris-tipis" | "margin-kurang-laku" | "evaluasi";

export function quadrantOf(qty: number, margin: number, xThreshold: number, yThreshold: number): Quadrant {
    if (qty >= xThreshold && margin >= yThreshold) return "bintang";
    if (qty >= xThreshold) return "laris-tipis";
    if (margin >= yThreshold) return "margin-kurang-laku";
    return "evaluasi";
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

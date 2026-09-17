
import { calculateMargin, calculateRevenue, calculateCost, type TransactionItemLike } from "./analytics";

export interface ProductLike {
    id: string;
    name: string;
    costPrice: number;
    sellingPrice: number;
}

export interface ScenarioInput {
    /** Harga jual baru. Kalau tidak diisi, pakai product.sellingPrice. */
    newSellingPrice?: number;
    /** Diskon 0-1 (0.1 = 10%), diterapkan di atas newSellingPrice/sellingPrice. */
    discountPercent?: number;
    /** Harga modal baru. Kalau tidak diisi, pakai product.costPrice. */
    newCostPrice?: number;
    /** Override manual quantity baseline. Kalau tidak diisi, pakai total qty historis. */
    quantityOverride?: number;
}

export interface ScenarioMetrics {
    revenue: number;
    cost: number;
    profit: number;
    margin: number;
}

export interface ScenarioResult {
    current: ScenarioMetrics;
    simulated: ScenarioMetrics;
    impact: {
        revenueChangePercent: number;
        profitChangePercent: number;
    };
    baselineQuantity: number;
    assumptions: string[];
}

export function simulateScenario(
    product: ProductLike,
    historicalItems: TransactionItemLike[],
    scenario: ScenarioInput
): ScenarioResult {
    const productItems = historicalItems.filter((i) => i.productId === product.id);

    const historicalQty = productItems.reduce((sum, i) => sum + i.quantity, 0);
    const baselineQuantity = scenario.quantityOverride ?? historicalQty;

    // "Current" = angka ASLI dari histori (bukan dihitung ulang pakai harga
    // produk sekarang), supaya tetap akurat walau harga produk pernah berubah
    // dari waktu ke waktu.
    const currentRevenue = calculateRevenue(productItems);
    const currentCost = calculateCost(productItems);
    const currentProfit = currentRevenue - currentCost;
    const currentMargin = calculateMargin(currentRevenue, currentProfit);

    let effectivePrice = scenario.newSellingPrice ?? product.sellingPrice;
    if (scenario.discountPercent) {
        effectivePrice = effectivePrice * (1 - scenario.discountPercent);
    }
    const effectiveCost = scenario.newCostPrice ?? product.costPrice;

    const simulatedRevenue = effectivePrice * baselineQuantity;
    const simulatedCost = effectiveCost * baselineQuantity;
    const simulatedProfit = simulatedRevenue - simulatedCost;
    const simulatedMargin = calculateMargin(simulatedRevenue, simulatedProfit);

    const revenueChangePercent =
        currentRevenue === 0 ? 0 : (simulatedRevenue - currentRevenue) / currentRevenue;
    const profitChangePercent =
        currentProfit === 0 ? 0 : (simulatedProfit - currentProfit) / currentProfit;

    const assumptions: string[] = [
        scenario.quantityOverride
            ? `Quantity memakai angka manual: ${baselineQuantity} unit.`
            : `Quantity diasumsikan tetap mengikuti total historis: ${baselineQuantity} unit.`,
    ];
    if (productItems.length === 0) {
        assumptions.push(
            "Tidak ada data transaksi historis untuk produk ini — hasil simulasi kurang bisa diandalkan. Sebaiknya isi quantityOverride manual."
        );
    }
    if (scenario.discountPercent && scenario.newSellingPrice) {
        assumptions.push(
            "Diskon diterapkan di atas newSellingPrice yang diinput, bukan di atas harga jual saat ini."
        );
    }

    return {
        current: { revenue: currentRevenue, cost: currentCost, profit: currentProfit, margin: currentMargin },
        simulated: {
            revenue: simulatedRevenue,
            cost: simulatedCost,
            profit: simulatedProfit,
            margin: simulatedMargin,
        },
        impact: { revenueChangePercent, profitChangePercent },
        baselineQuantity,
        assumptions,
    };
}

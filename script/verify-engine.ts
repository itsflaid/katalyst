import {
    calculateRevenue,
    calculateCost,
    calculateProfit,
    calculateMargin,
    summarizeByProduct,
    getTopProducts,
    getBusinessInsights,
    compareBusinessPeriods,
    compareProductPeriods,
    quadrantOf,
    estimateDaysCover,
    TransactionItemLike,
} from "../src/lib/analytics";
import { simulateScenario, ProductLike } from "../src/lib/simulation";

let passCount = 0;
let failCount = 0;

function check(label: string, actual: number, expected: number, tolerance = 0.5) {
    const diff = Math.abs(actual - expected);
    if (diff <= tolerance) {
        console.log(`  \x1b[32mPASS\x1b[0m  ${label}: ${actual}`);
        passCount++;
    } else {
        console.log(`  \x1b[31mFAIL\x1b[0m  ${label}: expected ${expected}, got ${actual}`);
        failCount++;
    }
}

// 1. Analytics — sanity check dasar
console.log("\n== Analytics: perhitungan dasar ==");

const items: TransactionItemLike[] = [
    { productId: "p1", quantity: 100, priceAtSale: 10000, costAtSale: 6000 },
    { productId: "p2", quantity: 50, priceAtSale: 20000, costAtSale: 8000 },
];

check("Total revenue", calculateRevenue(items), 100 * 10000 + 50 * 20000); // 2,000,000
check("Total cost", calculateCost(items), 100 * 6000 + 50 * 8000); // 1,000,000
check("Total profit", calculateProfit(items), 2_000_000 - 1_000_000); // 1,000,000
check("Margin", calculateMargin(2_000_000, 1_100_000), 0.55, 0.001);

const basicSummaries = summarizeByProduct(items, { p1: "Product A", p2: "Product B" });
const top1ByRevenue = getTopProducts(basicSummaries, "revenue", 1);
if (top1ByRevenue.length === 1) {
    console.log("  \x1b[32mPASS\x1b[0m  getTopProducts returns 1 item when limit=1");
    passCount++;
} else {
    console.log(`  \x1b[31mFAIL\x1b[0m  getTopProducts: expected 1 item, got ${top1ByRevenue.length}`);
    failCount++;
}

// 2. Analytics — insight rules
console.log("\n== Analytics: insight rules ==");

// 4 produk: A laris+margin rendah, B laris+margin oke, C margin tinggi+jarang laku, D biasa saja
const insightItems: TransactionItemLike[] = [
    { productId: "A", quantity: 300, priceAtSale: 9000, costAtSale: 7500 }, // margin 16.7%, qty tinggi -> popular_low_margin
    { productId: "B", quantity: 200, priceAtSale: 10000, costAtSale: 6000 }, // margin 40%, qty tinggi
    { productId: "C", quantity: 10, priceAtSale: 18000, costAtSale: 6000 }, // margin 67%, qty rendah -> high_margin_low_demand
    { productId: "D", quantity: 60, priceAtSale: 12000, costAtSale: 8000 }, // margin 33%
];
const names = { A: "Produk A", B: "Produk B", C: "Produk C", D: "Produk D" };
const summaries = summarizeByProduct(insightItems, names);
const insights = getBusinessInsights(summaries);

const hasPopularLowMargin = insights.some(
    (i) => i.type === "popular_low_margin" && i.productId === "A"
);
const hasHighMarginLowDemand = insights.some(
    (i) => i.type === "high_margin_low_demand" && i.productId === "C"
);

if (hasPopularLowMargin) {
    console.log("  \x1b[32mPASS\x1b[0m  Insight 'popular_low_margin' muncul untuk Produk A");
    passCount++;
} else {
    console.log("  \x1b[31mFAIL\x1b[0m  Insight 'popular_low_margin' TIDAK muncul untuk Produk A");
    failCount++;
}
if (hasHighMarginLowDemand) {
    console.log("  \x1b[32mPASS\x1b[0m  Insight 'high_margin_low_demand' muncul untuk Produk C");
    passCount++;
} else {
    console.log("  \x1b[31mFAIL\x1b[0m  Insight 'high_margin_low_demand' TIDAK muncul untuk Produk C");
    failCount++;
}

// ============================================================
// 3. Simulation — 3 acceptance test case dari spec
// ============================================================
console.log("\n== Simulation: acceptance test cases ==");

// Baseline: Kopi A, costPrice=6000, sellingPrice=10000, total qty historis 500
const kopiA: ProductLike = { id: "kopi-a", name: "Kopi A", costPrice: 6000, sellingPrice: 10000 };
const kopiAHistory: TransactionItemLike[] = [
    { productId: "kopi-a", quantity: 500, priceAtSale: 10000, costAtSale: 6000 },
];

// Test 1: harga naik ke 12.000 -> profit +50%
const t1 = simulateScenario(kopiA, kopiAHistory, { newSellingPrice: 12000 });
check("T1 simulated.revenue", t1.simulated.revenue, 6_000_000);
check("T1 simulated.profit", t1.simulated.profit, 3_000_000);
check("T1 profitChangePercent (%)", t1.impact.profitChangePercent * 100, 50, 0.1);

// Test 2: diskon 10% -> profit -25%
const t2 = simulateScenario(kopiA, kopiAHistory, { discountPercent: 0.1 });
check("T2 simulated.revenue", t2.simulated.revenue, 4_500_000);
check("T2 simulated.profit", t2.simulated.profit, 1_500_000);
check("T2 profitChangePercent (%)", t2.impact.profitChangePercent * 100, -25, 0.1);

// Test 3: cost naik 10% (6000 -> 6600) -> profit -15%
const t3 = simulateScenario(kopiA, kopiAHistory, { newCostPrice: 6600 });
check("T3 simulated.revenue", t3.simulated.revenue, 5_000_000);
check("T3 simulated.profit", t3.simulated.profit, 1_700_000);
check("T3 profitChangePercent (%)", t3.impact.profitChangePercent * 100, -15, 0.1);

// ============================================================
// 4. Analytics — period comparison (compareBusinessPeriods / compareProductPeriods)
// ============================================================
console.log("\n== Analytics: period comparison ==");

// Business-level: qty sama (100), tapi cost naik dari 6000 -> 7000/unit
// -> revenue flat, profit turun, margin turun 0.1 poin.
const prevPeriodItems: TransactionItemLike[] = [
    { productId: "A", quantity: 100, priceAtSale: 10000, costAtSale: 6000 },
];
const currPeriodItems: TransactionItemLike[] = [
    { productId: "A", quantity: 100, priceAtSale: 10000, costAtSale: 7000 },
];

const periodCmp = compareBusinessPeriods(currPeriodItems, prevPeriodItems);
check("compareBusinessPeriods revenueChangePercent (%)", periodCmp.change.revenueChangePercent * 100, 0, 0.1);
check("compareBusinessPeriods profitChangePercent (%)", periodCmp.change.profitChangePercent * 100, -25, 0.1);
check("compareBusinessPeriods marginChangePoints", periodCmp.change.marginChangePoints, -0.1, 0.001);

// Product-level: A naik qty 100->150 (harga/cost tetap), B baru muncul periode ini saja.
const prevProductItems: TransactionItemLike[] = [
    { productId: "A", quantity: 100, priceAtSale: 10000, costAtSale: 6000 },
];
const currProductItems: TransactionItemLike[] = [
    { productId: "A", quantity: 150, priceAtSale: 10000, costAtSale: 6000 },
    { productId: "B", quantity: 50, priceAtSale: 8000, costAtSale: 5000 },
];
const prevProductSummaries = summarizeByProduct(prevProductItems, { A: "Produk A" });
const currProductSummaries = summarizeByProduct(currProductItems, { A: "Produk A", B: "Produk B" });
const productCmp = compareProductPeriods(currProductSummaries, prevProductSummaries);

const cmpA = productCmp.find((p) => p.productId === "A");
const cmpB = productCmp.find((p) => p.productId === "B");

if (cmpA && cmpA.previous !== null) {
    check("compareProductPeriods A quantityChangePercent (%)", cmpA.change.quantityChangePercent * 100, 50, 0.1);
    check("compareProductPeriods A profitChangePercent (%)", cmpA.change.profitChangePercent * 100, 50, 0.1);
} else {
    console.log("  \x1b[31mFAIL\x1b[0m  compareProductPeriods: Produk A seharusnya punya data periode sebelumnya");
    failCount++;
}

if (cmpB && cmpB.previous === null && cmpB.change.revenueChangePercent === 0) {
    console.log("  \x1b[32mPASS\x1b[0m  compareProductPeriods: Produk B (baru) previous=null, change=0");
    passCount++;
} else {
    console.log("  \x1b[31mFAIL\x1b[0m  compareProductPeriods: Produk B (baru) seharusnya previous=null & change=0");
    failCount++;
}

// ============================================================
// 5. Analytics — matriks volume vs margin + estimasi hari stok
// ============================================================
console.log("\n== Analytics: quadrant & days cover ==");

if (quadrantOf(100, 0.5, 50, 0.3) === "bintang") {
    console.log("  \x1b[32mPASS\x1b[0m  quadrantOf laku+margin baik = bintang");
    passCount++;
} else {
    console.log("  \x1b[31mFAIL\x1b[0m  quadrantOf laku+margin baik seharusnya bintang");
    failCount++;
}
if (quadrantOf(100, 0.1, 50, 0.3) === "laris-tipis") {
    console.log("  \x1b[32mPASS\x1b[0m  quadrantOf laris+margin tipis = laris-tipis");
    passCount++;
} else {
    console.log("  \x1b[31mFAIL\x1b[0m  quadrantOf laris+margin tipis seharusnya laris-tipis");
    failCount++;
}
if (quadrantOf(5, 0.6, 50, 0.3) === "margin-kurang-laku") {
    console.log("  \x1b[32mPASS\x1b[0m  quadrantOf margin bagus+kurang laku = margin-kurang-laku");
    passCount++;
} else {
    console.log("  \x1b[31mFAIL\x1b[0m  quadrantOf margin bagus+kurang laku seharusnya margin-kurang-laku");
    failCount++;
}
if (quadrantOf(5, 0.1, 50, 0.3) === "evaluasi") {
    console.log("  \x1b[32mPASS\x1b[0m  quadrantOf dua-duanya rendah = evaluasi");
    passCount++;
} else {
    console.log("  \x1b[31mFAIL\x1b[0m  quadrantOf dua-duanya rendah seharusnya evaluasi");
    failCount++;
}

check("estimateDaysCover 70 stok / 140 per 14 hari", estimateDaysCover(70, 140, 14), 7, 0.001);
if (!isFinite(estimateDaysCover(10, 0, 14))) {
    console.log("  \x1b[32mPASS\x1b[0m  estimateDaysCover tanpa penjualan = Infinity");
    passCount++;
} else {
    console.log("  \x1b[31mFAIL\x1b[0m  estimateDaysCover tanpa penjualan seharusnya Infinity");
    failCount++;
}

// ============================================================
console.log(`\n${passCount} passed, ${failCount} failed\n`);
if (failCount > 0) process.exit(1);

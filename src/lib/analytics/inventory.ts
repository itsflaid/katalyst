// daysCover = stock / (soldLastNDays / n)   (Infinity bila soldLastNDays ≤ 0 atau n ≤ 0)
export function estimateDaysCover(stock: number, soldLastNDays: number, n: number): number {
    if (n <= 0 || soldLastNDays <= 0) return Infinity;
    return stock / (soldLastNDays / n);
}

export interface InventoryRow {
    id: string;
    name: string;
    stock: number;
    costPrice: number;
    minStock: number | null;
    sold14: number;
    isActive: boolean;
}

// stockValue = Σ stock × costPrice   (Rupiah, semua produk)
// out = stock ≤ 0   (produk aktif)
// restock = 0 < stock ≤ minStock   (minStock kosong dianggap 5, produk aktif)
// dead = stock > 0 dan sold14 = 0   (produk aktif)
// days = estimateDaysCover(stock, sold14, windowDays)   (produk aktif, sold14 > 0)
export function summarizeInventoryRows(rows: InventoryRow[], windowDays: number) {
    const active = rows.filter((r) => r.isActive);
    const stockValue = rows.reduce((s, r) => s + r.stock * r.costPrice, 0);
    const inactiveWithStock = rows.filter((r) => !r.isActive && r.stock > 0);
    const inactiveStock = {
        count: inactiveWithStock.length,
        value: inactiveWithStock.reduce((s, r) => s + r.stock * r.costPrice, 0)
    };
    const outCount = active.filter((r) => r.stock <= 0).length;
    const restockCount = active.filter((r) => r.stock > 0 && r.stock <= (r.minStock ?? 5)).length;
    const deadFull = active
        .filter((r) => r.stock > 0 && r.sold14 === 0)
        .map((r) => ({ id: r.id, name: r.name, stock: r.stock, value: r.stock * r.costPrice }))
        .sort((a, b) => b.value - a.value);
    const deadValue = deadFull.reduce((s, r) => s + r.value, 0);
    const daysList = active
        .filter((r) => r.sold14 > 0)
        .map((r) => ({ id: r.id, name: r.name, stock: r.stock, days: estimateDaysCover(r.stock, r.sold14, windowDays) }))
        .sort((a, b) => a.days - b.days)
        .slice(0, 8);
    return {
        windowDays,
        stockValue,
        inactiveStock,
        outCount,
        restockCount,
        deadCount: deadFull.length,
        deadValue,
        daysList,
        deadList: deadFull.slice(0, 5)
    };
}

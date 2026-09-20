// Estimasi berapa hari stok bertahan: stock / (soldLastNDays / n).
// Tanpa penjualan di jendela → Infinity (caller mengecualikan dari chart
// "paling mendesak" dan memasukkannya ke kandidat stok mati).
export function estimateDaysCover(stock: number, soldLastNDays: number, n: number): number {
    if (n <= 0 || soldLastNDays <= 0) return Infinity;
    return stock / (soldLastNDays / n);
}

// daysCover = stock / (soldLastNDays / n)   (Infinity bila soldLastNDays ≤ 0 atau n ≤ 0)
export function estimateDaysCover(stock: number, soldLastNDays: number, n: number): number {
    if (n <= 0 || soldLastNDays <= 0) return Infinity;
    return stock / (soldLastNDays / n);
}

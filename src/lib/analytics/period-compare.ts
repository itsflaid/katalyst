import { getBusinessSummary, type BusinessSummary, type ProductSummary, type TransactionItemLike } from './core';
import { deltaRatio } from './facts';

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

// ---------------------------------------------------------------------------
// Perbandingan periode (buat Copilot jawab "kenapa berubah", bukan cuma
// "kondisi sekarang"). Dipakai bareng getBusinessSummary/summarizeByProduct:
// caller yang tanggung jawab misahin currentItems vs previousItems by tanggal.
// ---------------------------------------------------------------------------

/** Persen perubahan (pecahan) via deltaRatio; "dari nol" (null) dipetakan ke 0
 *  agar kontrak lama (number, produk baru = 0) tetap utuh. Penyebut |prev|:
 *  basis negatif kini benar tandanya (−100 → −50 = +0.5, dulu −0.5). */
function percentChange(current: number, previous: number): number {
    return deltaRatio(current, previous) ?? 0;
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

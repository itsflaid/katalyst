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

function percentChange(current: number, previous: number): number {
    return deltaRatio(current, previous) ?? 0;
}

// revenueChangePercent = (cur.revenue − prev.revenue) / |prev.revenue|   (0 bila prev = 0)
// profitChangePercent  = (cur.profit − prev.profit) / |prev.profit|
// marginChangePoints   = cur.margin − prev.margin
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

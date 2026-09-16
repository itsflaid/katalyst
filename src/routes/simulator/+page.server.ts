import { db } from '$lib/server/db';
import { product, transaction, transactionItem } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { TransactionItemLike } from '$lib/analytics';
import type { PageServerLoad } from './$types';
import type { Actions } from './$types';
import { simulateScenario } from '$lib/simulation';

export const load: PageServerLoad = async ({ locals, url }) => {
  const businessId = locals.user!.businessId as string;
  const products = await db.select().from(product).where(eq(product.businessId, businessId));

  return {
    products,
    preselectedProductId: url.searchParams.get('productId') ?? products[0]?.id ?? null
  };
};

export const actions: Actions = {
  simulate: async ({ request, locals }) => {
    const businessId = locals.user!.businessId as string;
    const form = await request.formData();

    const productId = String(form.get('productId'));
    const newSellingPrice = form.get('newSellingPrice') ? Number(form.get('newSellingPrice')) : undefined;
    const newCostPrice = form.get('newCostPrice') ? Number(form.get('newCostPrice')) : undefined;
    const discountPercent = form.get('discountPercent') ? Number(form.get('discountPercent')) / 100 : undefined;
    const quantityOverride = form.get('quantityOverride') ? Number(form.get('quantityOverride')) : undefined;

    const [p] = await db.select().from(product).where(eq(product.id, productId));

    const txItems = await db
      .select({
        productId: transactionItem.productId,
        quantity: transactionItem.quantity,
        priceAtSale: transactionItem.priceAtSale,
        costAtSale: transactionItem.costAtSale
      })
      .from(transactionItem)
      .innerJoin(transaction, eq(transaction.id, transactionItem.transactionId))
      .where(eq(transaction.businessId, businessId));

    const items: TransactionItemLike[] = txItems;

    const result = simulateScenario(p, items, {
      newSellingPrice,
      newCostPrice,
      discountPercent,
      quantityOverride
    });

    return { result, productId };
  }
};

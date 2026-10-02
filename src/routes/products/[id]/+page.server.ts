import { db } from '$lib/server/db';
import { product, stockMovement, user } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { metricsOf, ZERO_FACTS } from '$lib/analytics';
import { queryFactsByProduct } from '$lib/server/domains/facts/queries';
import { DEFAULT_TZ } from '$lib/shared/time';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const businessId = locals.user!.businessId as string;

  const [p] = await db
    .select()
    .from(product)
    .where(and(eq(product.id, params.id), eq(product.businessId, businessId)));

  if (!p) throw error(404, 'Produk tidak ditemukan');

  // Performa all-time dari lapisan Facts.
  // Bentuk `performance` (ProductSummary) tetap.
  const factsMap = await queryFactsByProduct(db, businessId, { from: null, to: null }, { productIds: [p.id] });
  const m = metricsOf(factsMap.get(p.id) ?? ZERO_FACTS);
  const performance = {
    productId: p.id,
    name: p.name,
    quantitySold: m.qty,
    revenue: m.revenue,
    cost: m.cost,
    profit: m.profit,
    margin: m.margin
  };

  const movements = await db
    .select({
      qtyChange: stockMovement.qtyChange,
      reason: stockMovement.reason,
      note: stockMovement.note,
      createdAt: stockMovement.createdAt,
      createdByName: user.name
    })
    .from(stockMovement)
    .leftJoin(user, eq(user.id, stockMovement.createdBy))
    .where(and(eq(stockMovement.businessId, businessId), eq(stockMovement.productId, p.id)))
    .orderBy(desc(stockMovement.createdAt))
    .limit(20);

  return { product: p, performance, movements, role: locals.user!.role === 'OWNER' ? 'OWNER' : 'STAFF', timezone: locals.business?.timezone ?? DEFAULT_TZ };
};

import { error } from '@sveltejs/kit';
import { getProductDetail } from '$lib/server/domains/products';
import { requireTenant } from '$lib/server/domains/auth/guards';
import { DEFAULT_TZ } from '$lib/shared/time';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const { businessId, role } = requireTenant(locals);

  const detail = await getProductDetail(businessId, params.id);
  if (!detail) throw error(404, 'Produk tidak ditemukan');

  return {
    ...detail,
    role,
    timezone: locals.business?.timezone ?? DEFAULT_TZ
  };
};

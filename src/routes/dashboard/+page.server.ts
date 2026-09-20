import { getDashboardPageData } from '$lib/server/domains/stats';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  return getDashboardPageData(locals.user!.businessId as string);
};

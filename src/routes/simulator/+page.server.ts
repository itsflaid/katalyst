import { getSimulatorPageData } from '$lib/server/domains/stats';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  return getSimulatorPageData(locals.user!.businessId as string, url);
};

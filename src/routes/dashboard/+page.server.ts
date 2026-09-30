import { getDashboardPageData } from '$lib/server/domains/stats';
import { DEFAULT_TZ } from '$lib/shared/time';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const tz = locals.business?.timezone ?? DEFAULT_TZ;
  const data = await getDashboardPageData(locals.user!.businessId as string, tz);
  return { ...data, timezone: tz };
};

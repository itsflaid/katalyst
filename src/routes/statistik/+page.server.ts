import { getStatistikPageData } from '$lib/server/domains/stats';
import { requireOwner } from '$lib/server/domains/auth/guards';
import { DEFAULT_TZ } from '$lib/shared/time';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  requireOwner(locals);
  const tz = locals.business?.timezone ?? DEFAULT_TZ;
  const data = await getStatistikPageData(locals.user!.businessId as string, url, tz);
  return { ...data, timezone: tz };
};

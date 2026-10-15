import { getStatistikPageData } from '$lib/server/domains/stats';
import { requireOwner } from '$lib/server/domains/auth/guards';
import { DEFAULT_TZ } from '$lib/shared/time';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  const { businessId } = requireOwner(locals);
  const tz = locals.business?.timezone ?? DEFAULT_TZ;
  const data = await getStatistikPageData(businessId, url, tz);
  return { ...data, timezone: tz };
};

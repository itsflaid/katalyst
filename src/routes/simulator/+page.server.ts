import { getSimulatorPageData } from '$lib/server/domains/stats';
import { getZakatInput } from '$lib/server/domains/zakat';
import { DEFAULT_TZ } from '$lib/shared/time';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  const tz = locals.business?.timezone ?? DEFAULT_TZ;
  const businessId = locals.user!.businessId as string;
  const data = await getSimulatorPageData(businessId, url, tz);
  // Input zakat mentah (null bila pengaturan belum ada); dampak dihitung di client.
  const zakat = await getZakatInput(businessId, tz, new Date());
  return { ...data, timezone: tz, zakat };
};

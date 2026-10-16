import { DEFAULT_TZ } from '$lib/shared/time';
import { getLayoutInsights, getLayoutRestock } from '$lib/server/domains/stats';
import type { BusinessInsight } from '$lib/analytics';
import type { BellRestock } from '$lib/components/dashboard/insight-meta';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  const sessionUser = locals.user;
  if (!sessionUser) return { user: null, businessName: null, timezone: DEFAULT_TZ };

  // additionalFields better-auth (role/businessId) balik sebagai string biasa, bukan literal type; dipetakan di sini, satu tempat.
  // Bisnis dibaca dari locals (diisi hooks) agar cukup satu query per request.
  const role: 'OWNER' | 'STAFF' = sessionUser.role === 'OWNER' ? 'OWNER' : 'STAFF';
  const timezone = locals.business?.timezone ?? DEFAULT_TZ;

  // Lonceng (insight + restock) khusus owner: staff tak memuatnya dan tak melihat loncengnya.
  const businessId = sessionUser.businessId ?? undefined;
  let insights: BusinessInsight[] | undefined;
  let restock: BellRestock | undefined;
  if (role === 'OWNER' && businessId) {
    [insights, restock] = await Promise.all([getLayoutInsights(businessId, timezone), getLayoutRestock(businessId)]);
  }

  return {
    user: { ...sessionUser, role },
    businessName: locals.business?.name ?? null,
    timezone,
    insights,
    restock
  };
};

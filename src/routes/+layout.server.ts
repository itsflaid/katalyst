import { DEFAULT_TZ } from '$lib/shared/time';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  const sessionUser = locals.user;
  if (!sessionUser) return { user: null, businessName: null, timezone: DEFAULT_TZ };

  // additionalFields better-auth (role/businessId) balik sebagai string biasa,
  // bukan literal type 'OWNER' | 'STAFF' — di-cast di sini, satu tempat,
  // biar Sidebar.svelte gak perlu tau soal ketidaksempurnaan typing ini.
  // Bisnis dibaca dari locals (diisi hooks) agar cukup satu query per request.
  const role = (sessionUser.role as 'OWNER' | 'STAFF' | null) ?? 'STAFF';

  return {
    user: { ...sessionUser, role },
    businessName: locals.business?.name ?? null,
    timezone: locals.business?.timezone ?? DEFAULT_TZ
  };
};

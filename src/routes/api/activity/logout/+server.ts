import { json } from '@sveltejs/kit';
import { actorOf, netOf, recordActivity } from '$lib/server/domains/activity/log';
import { requireTenant } from '$lib/server/domains/auth/guards';
import type { RequestHandler } from './$types';

// Dipanggil client sebelum signOut; best-effort, tutup tab tanpa logout memang tidak tercatat.
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  const { businessId, user } = requireTenant(locals);
  await recordActivity({
    businessId,
    actor: actorOf(user),
    action: 'LOGOUT',
    ...netOf({ request, getClientAddress })
  });
  return json({ ok: true });
};

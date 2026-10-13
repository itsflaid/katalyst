import { json } from '@sveltejs/kit';
import { actorOf, netOf, recordActivity } from '$lib/server/domains/activity/log';
import type { RequestHandler } from './$types';

// Dipanggil client sebelum signOut; best-effort, tutup tab tanpa logout memang tidak tercatat.
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  if (!locals.user?.businessId) return json({ ok: false }, { status: 401 });
  await recordActivity({
    businessId: locals.user.businessId as string,
    actor: actorOf(locals.user),
    action: 'LOGOUT',
    ...netOf({ request, getClientAddress })
  });
  return json({ ok: true });
};

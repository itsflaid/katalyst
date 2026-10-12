import { json } from '@sveltejs/kit';
import { actorOf, recordActivity } from '$lib/server/domains/activity/log';
import type { RequestHandler } from './$types';

// Dipanggil client sebelum signOut; best-effort, tutup tab tanpa logout memang tidak tercatat.
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.businessId) return json({ ok: false }, { status: 401 });
  await recordActivity({
    businessId: locals.user.businessId as string,
    actor: actorOf(locals.user),
    action: 'LOGOUT',
    ip: request.headers.get('cf-connecting-ip'),
    userAgent: request.headers.get('user-agent')
  });
  return json({ ok: true });
};

import { fail, redirect } from '@sveltejs/kit';
import { acceptInvite, getInviteCard } from '$lib/server/domains/invites';
import { netOf, recordActivity } from '$lib/server/domains/activity/log';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
  // Staff yang sudah login tidak perlu aktivasi, lempar ke rute peran.
  if (locals.user) throw redirect(303, '/');
  return getInviteCard(params.token);
};

export const actions: Actions = {
  accept: async ({ params, request, getClientAddress }) => {
    const form = await request.formData();
    const result = await acceptInvite(params.token, form.get('password'), form.get('confirmPassword'), form.get('name'));
    if (!result.ok) {
      if (result.flag === 'invalid') return fail(400, { invalid: true, message: result.message });
      if (result.flag === 'expired') return fail(400, { expired: true, message: result.message });
      return fail(result.code, { message: result.message });
    }
    const { userId, username, name, businessId } = result.data;

    // Undangan tidak membuat sesi sehingga tak pernah tercatat LOGIN; JOIN menutup lubang itu.
    await recordActivity({
      businessId,
      actor: { id: userId ?? null, name, role: 'STAFF' },
      ...netOf({ request, getClientAddress }),
      action: 'STAFF_JOIN',
      entityType: 'user',
      entityId: userId,
      meta: { username, name }
    });

    // Idempotent: kalau link diklik/submit 2x, submit kedua jatuh ke
    // cabang acceptedAt di atas (bukan akun dobel).
    throw redirect(303, '/login?invited=1');
  }
};

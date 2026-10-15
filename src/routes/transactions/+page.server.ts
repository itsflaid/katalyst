import { checkoutCart, loadPosPage, voidTransaction } from '$lib/server/domains/transactions';
import { requireOwner, requireTenant } from '$lib/server/domains/auth/guards';
import { netOf } from '$lib/server/domains/activity/log';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  const { businessId } = requireTenant(locals);
  return loadPosPage(businessId, {
    page: url.searchParams.get('page'),
    kasir: url.searchParams.get('kasir'),
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
    tzRaw: locals.business?.timezone
  });
};

export const actions: Actions = {
  create: async ({ request, locals, getClientAddress }) => {
    const { businessId, userId, role, user: actor } = requireTenant(locals);
    const form = await request.formData();
    const cashierName = (actor.name as string | null | undefined) ?? (actor as { username?: string | null }).username ?? null;
    const result = await checkoutCart({
      businessId,
      userId,
      role,
      cashierName,
      itemsRaw: form.get('items'),
      globalDiscountIdRaw: form.get('globalDiscountId'),
      expectedTotalRaw: form.get('expectedTotal'),
      now: new Date(),
      net: netOf({ request, getClientAddress })
    });
    if (!result.ok) {
      return fail(result.code, {
        message: result.message,
        ...(result.errorCode !== undefined ? { code: result.errorCode } : {}),
        ...(result.newTotal !== undefined ? { newTotal: result.newTotal } : {})
      });
    }
    return { success: true };
  },

  deleteTx: async ({ request, locals, getClientAddress }) => {
    const { businessId, userId, user: actor } = requireOwner(locals);
    const form = await request.formData();
    const result = await voidTransaction({
      businessId,
      userId,
      actor,
      txIdRaw: form.get('txId'),
      net: netOf({ request, getClientAddress })
    });
    if (!result.ok) return fail(result.code, { message: result.message });
    return { success: true };
  }
};

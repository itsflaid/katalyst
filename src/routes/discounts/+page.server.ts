import { fail } from '@sveltejs/kit';
import { requireOwner } from '$lib/server/domains/auth/guards';
import { createDiscount, deleteDiscount, listDiscountProducts, listDiscounts, toggleDiscount, updateDiscount } from '$lib/server/domains/discounts';
import { getDiscountStatus } from '$lib/shared/discount';
import { actorOf, netOf, recordActivity } from '$lib/server/domains/activity/log';
import { DEFAULT_TZ, makeTime } from '$lib/shared/time';
import type { Actions, PageServerLoad } from './$types';

// Tab: aktif (ACTIVE) | terjadwal (SCHEDULED) | selesai (EXPIRED + SOLD_OUT + INACTIVE).
const TABS = ['aktif', 'terjadwal', 'selesai'] as const;
type Tab = (typeof TABS)[number];

export const load: PageServerLoad = async ({ locals, url }) => {
  const { businessId } = requireOwner(locals);
  const tz = locals.business?.timezone ?? DEFAULT_TZ;
  const now = new Date();

  const raws = await listDiscounts(businessId);
  const discounts = raws.map((d) => ({
    ...d,
    status: getDiscountStatus(
      {
        id: d.id,
        name: d.name,
        scope: d.scope,
        percent: d.percent,
        productId: d.productId,
        isActive: d.isActive,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        quota: d.quota,
        quotaUsed: d.quotaUsed,
        createdAt: d.createdAt
      },
      now
    ),
    // Timestamp sebagai ISO string (aman lewat devalue ke client).
    startsAt: d.startsAt.toISOString(),
    endsAt: d.endsAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString()
  }));

  const tab: Tab = (TABS as readonly string[]).includes(url.searchParams.get('tab') ?? '') ? (url.searchParams.get('tab') as Tab) : 'aktif';
  const counts = {
    aktif: discounts.filter((d) => d.status === 'ACTIVE').length,
    terjadwal: discounts.filter((d) => d.status === 'SCHEDULED').length,
    selesai: discounts.filter((d) => ['EXPIRED', 'SOLD_OUT', 'INACTIVE'].includes(d.status)).length
  };

  const products = await listDiscountProducts(businessId);

  return { discounts, tab, counts, products, timezone: tz };
};

export const actions: Actions = {
  create: async ({ request, locals, getClientAddress }) => {
    const { businessId, user: actor } = requireOwner(locals);
    const T = makeTime(locals.business?.timezone ?? DEFAULT_TZ);
    const result = await createDiscount(businessId, await request.formData(), new Date(), T);
    if (!result.ok) return fail(result.code, { message: result.message, code: result.errorCode, lossProducts: result.lossProducts });
    const { id: discountId, name, percent, scope } = result.data;
    await recordActivity({
      businessId,
      actor: actorOf(actor),
      ...netOf({ request, getClientAddress }),
      action: 'DISCOUNT_CREATE',
      entityType: 'discount',
      entityId: discountId,
      meta: { name, percent, scope }
    });
    return { success: true };
  },

  update: async ({ request, locals, getClientAddress }) => {
    const { businessId, user } = requireOwner(locals);
    const T = makeTime(locals.business?.timezone ?? DEFAULT_TZ);
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const result = await updateDiscount(businessId, id, form, new Date(), T);
    if (!result.ok) return fail(result.code, { message: result.message, code: result.errorCode, lossProducts: result.lossProducts });
    const { name, percent } = result.data;
    await recordActivity({
      businessId,
      actor: actorOf(user),
      ...netOf({ request, getClientAddress }),
      action: 'DISCOUNT_UPDATE',
      entityType: 'discount',
      entityId: id,
      meta: { name, percent }
    });
    return { success: true };
  },

  toggle: async ({ request, locals, getClientAddress }) => {
    const { businessId, user } = requireOwner(locals);
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const result = await toggleDiscount(businessId, id);
    if (!result.ok) return fail(result.code, { message: result.message });
    const { name, isActive } = result.data;
    await recordActivity({
      businessId,
      actor: actorOf(user),
      ...netOf({ request, getClientAddress }),
      action: 'DISCOUNT_TOGGLE',
      entityType: 'discount',
      entityId: id,
      meta: { name, isActive }
    });
    return { success: true };
  },

  delete: async ({ request, locals, getClientAddress }) => {
    const { businessId, user } = requireOwner(locals);
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const result = await deleteDiscount(businessId, id);
    if (!result.ok) return fail(result.code, { message: result.message });
    const { name } = result.data;
    await recordActivity({
      businessId,
      actor: actorOf(user),
      ...netOf({ request, getClientAddress }),
      action: 'DISCOUNT_DELETE',
      entityType: 'discount',
      entityId: id,
      meta: { name }
    });
    return { success: true };
  }
};

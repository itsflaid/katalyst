import { fail } from '@sveltejs/kit';
import { denyUnlessOwner } from '$lib/server/domains/products';
import { daysBetween, zakatOf } from '$lib/analytics';
import { getZakatInput, getZakatSetting, parseBalanceForm, parseSettingForm, upsertZakatSetting } from '$lib/server/domains/zakat';
import { DEFAULT_TZ, makeTime } from '$lib/shared/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const businessId = locals.user!.businessId as string;
  const tz = locals.business?.timezone ?? DEFAULT_TZ;
  const now = new Date();
  const T = makeTime(tz);
  const today = T.dayKey(now);
  const [input, setting] = await Promise.all([getZakatInput(businessId, tz, now), getZakatSetting(businessId)]);
  return {
    zakat: input ? { input, result: zakatOf(input) } : null,
    setting: setting
      ? {
          goldPricePerGram: setting.goldPricePerGram,
          nisabGrams: setting.nisabGrams,
          haulStartDate: setting.haulStartDate,
          stockValuation: setting.stockValuation,
          cash: setting.cash,
          receivable: setting.receivable,
          debt: setting.debt,
          goldAgeDays: setting.goldPriceUpdatedAt ? daysBetween(T.dayKey(setting.goldPriceUpdatedAt), today) : null,
          balanceAgeDays: setting.balanceUpdatedAt ? daysBetween(T.dayKey(setting.balanceUpdatedAt), today) : null
        }
      : null,
    timezone: tz
  };
};

export const actions: Actions = {
  saveSetting: async ({ request, locals }) => {
    const denied = denyUnlessOwner(locals, 'saveSetting', 'Cuma Owner yang bisa mengatur zakat.');
    if (denied) return denied;
    const businessId = locals.user!.businessId as string;
    const parsed = parseSettingForm(await request.formData());
    if ('error' in parsed) return fail(400, { message: parsed.error });
    await upsertZakatSetting(businessId, parsed.data, { gold: true });
    return { success: true };
  },
  saveBalance: async ({ request, locals }) => {
    const denied = denyUnlessOwner(locals, 'saveBalance', 'Cuma Owner yang bisa menyimpan posisi keuangan.');
    if (denied) return denied;
    const businessId = locals.user!.businessId as string;
    const parsed = parseBalanceForm(await request.formData());
    if ('error' in parsed) return fail(400, { message: parsed.error });
    await upsertZakatSetting(businessId, parsed.data, { balance: true });
    return { success: true };
  }
};

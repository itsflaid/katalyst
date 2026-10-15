import { error } from '@sveltejs/kit';
import { getAccountProfile } from '$lib/server/domains/auth/account';
import { requireTenant } from '$lib/server/domains/auth/guards';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { userId } = requireTenant(locals);
  const profile = await getAccountProfile(userId);
  if (!profile) throw error(404, 'Akun tidak ditemukan.');
  return profile;
};

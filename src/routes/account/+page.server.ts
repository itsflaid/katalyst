import { error } from '@sveltejs/kit';
import { requireTenant } from '$lib/server/domains/auth/guards';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { userId } = requireTenant(locals);
  const [u] = await db.select({ name: user.name, username: user.username, role: user.role }).from(user).where(eq(user.id, userId));
  if (!u) throw error(404, 'Akun tidak ditemukan.');
  return { name: u.name ?? '', username: u.username ?? '', role: u.role };
};

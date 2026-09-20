import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw error(401, 'Harus login dulu.');
  const [u] = await db
    .select({ name: user.name, username: user.username, role: user.role })
    .from(user)
    .where(eq(user.id, locals.user.id as string));
  if (!u) throw error(404, 'Akun tidak ditemukan.');
  return { name: u.name ?? '', username: u.username ?? '', role: u.role };
};

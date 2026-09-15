import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { business } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

// Setara app/api/business/route.ts — cuma Owner yang boleh ubah nama bisnis.
export const PATCH: RequestHandler = async ({ request, locals }) => {
  if (!locals.user || locals.user.role !== 'OWNER' || !locals.user.businessId) {
    throw error(403, 'Cuma Owner yang bisa mengubah profil bisnis.');
  }

  const { name } = (await request.json()) as { name: string };
  if (!name?.trim()) {
    throw error(400, 'Nama bisnis tidak boleh kosong.');
  }

  await db.update(business).set({ name: name.trim() }).where(eq(business.id, locals.user.businessId));

  return json({ name: name.trim() });
};

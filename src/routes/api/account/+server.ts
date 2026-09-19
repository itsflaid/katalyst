import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

// Self-service: user login (role apa pun) boleh ganti NAMANYA SENDIRI.
// Email sengaja tidak bisa diganti di sini (identitas login better-auth,
// terikat tabel `account` — ganti email = alur invite ulang via owner).
export const PATCH: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    throw error(401, 'Harus login dulu.');
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof (body as { name?: unknown }).name === 'string' ? (body as { name: string }).name.trim() : '';
  if (!name) {
    throw error(400, 'Nama tidak boleh kosong.');
  }
  if (name.length > 100) {
    throw error(400, 'Nama maksimal 100 karakter.');
  }

  await db.update(user).set({ name }).where(eq(user.id, locals.user.id as string));

  // Catatan audit: struk lama tetap menampilkan nama lama (snapshot
  // cashier_name), struk baru pakai nama baru. Tidak ada backfill massal.
  return json({ name });
};

import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { business } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { isBizTz, DEFAULT_TZ, type BizTz } from '$lib/shared/time';
import type { RequestHandler } from './$types';

// Cuma Owner yang boleh ubah profil bisnis; mendukung update parsial nama dan/atau zona waktu.
export const PATCH: RequestHandler = async ({ request, locals }) => {
  if (!locals.user || locals.user.role !== 'OWNER' || !locals.user.businessId) {
    throw error(403, 'Cuma Owner yang bisa mengubah profil bisnis.');
  }

  const body = (await request.json()) as { name?: unknown; timezone?: unknown };
  const hasName = body.name !== undefined;
  const hasTz = body.timezone !== undefined;
  if (!hasName && !hasTz) {
    throw error(400, 'Tidak ada perubahan yang dikirim.');
  }

  const patch: { name?: string; timezone?: BizTz } = {};
  if (hasName) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw error(400, 'Nama bisnis tidak boleh kosong.');
    patch.name = name;
  }
  if (hasTz) {
    // Zona harus salah satu dari whitelist — bukan zona perangkat sembarang.
    if (!isBizTz(body.timezone)) throw error(400, 'Zona waktu tidak valid.');
    patch.timezone = body.timezone;
  }

  await db.update(business).set(patch).where(eq(business.id, locals.user.businessId));
  const [b] = await db
    .select({ name: business.name, timezone: business.timezone })
    .from(business)
    .where(eq(business.id, locals.user.businessId));

  return json({ name: b?.name ?? patch.name ?? '', timezone: b?.timezone ?? patch.timezone ?? DEFAULT_TZ });
};

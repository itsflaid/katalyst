import { json, error } from '@sveltejs/kit';
import { auth } from '$lib/server/domains/auth';
import { db } from '$lib/server/db';
import { readJsonObject } from '$lib/server/http';
import { user } from '$lib/server/db/schema';
import { generateTempPassword } from '$lib/server/domains/invites';
import { actorOf, netOf, recordActivity } from '$lib/server/domains/activity/log';
import { requireOwner } from '$lib/server/domains/auth/guards';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

// Reset password staff aktif yang lupa password: server set password sementara + cabut semua sesi staff.
// Password sementara ditampilkan sekali ke owner; staff login pakai itu lalu wajib ganti sendiri di halaman Akun.
// Beda dengan "Kirim ulang" di Undangan Pending (untuk akun belum jadi: link invite baru, bukan password).
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  const { businessId, userId, user: actor } = requireOwner(locals);

  const parsed = await readJsonObject(request);
  if (!parsed.ok) throw error(400, parsed.message);
  const id = typeof (parsed.body as { id?: unknown }).id === 'string' ? (parsed.body as { id: string }).id : '';
  if (!id) throw error(400, 'Id staff wajib diisi.');
  if (id === userId) throw error(400, 'Ganti password sendiri lewat halaman Akun.');

  const [target] = await db
    .select({ id: user.id, name: user.name, username: user.username, role: user.role, businessId: user.businessId })
    .from(user)
    .where(and(eq(user.id, id), eq(user.businessId, businessId)));
  if (!target) throw error(404, 'Staff tidak ditemukan.');
  if (target.role !== 'STAFF') throw error(400, 'Hanya akun STAFF yang bisa di-reset di sini.');

  const tempPassword = generateTempPassword();

  // headers: teruskan cookie sesi owner, endpoint admin menolak tanpa sesi admin.
  await auth.api.setUserPassword({
    body: { userId: id, newPassword: tempPassword },
    headers: request.headers
  });
  // Sesi lama langsung mati, cuma login baru pakai password sementara yang bisa masuk.
  await auth.api.revokeUserSessions({ body: { userId: id }, headers: request.headers });

  await recordActivity({
    businessId,
    actor: actorOf(actor),
    ...netOf({ request, getClientAddress }),
    action: 'STAFF_PASSWORD_RESET',
    entityType: 'user',
    entityId: id,
    meta: { username: target.username, name: target.name }
  });

  return json({ tempPassword });
};

import { json, error } from '@sveltejs/kit';
import { readJsonObject } from '$lib/server/http';
import { resetStaffPassword } from '$lib/server/domains/staff';
import { actorOf, netOf, recordActivity } from '$lib/server/domains/activity/log';
import { requireOwner } from '$lib/server/domains/auth/guards';
import type { RequestHandler } from './$types';

// Reset password staff aktif yang lupa password: server set password sementara + cabut semua sesi staff.
// Password sementara ditampilkan sekali ke owner; staff login pakai itu lalu wajib ganti sendiri di halaman Akun.
// Beda dengan "Kirim ulang" di Undangan Pending (untuk akun belum jadi: link invite baru, bukan password).
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  const { businessId, userId, user: actor } = requireOwner(locals);

  const parsed = await readJsonObject(request);
  if (!parsed.ok) throw error(400, parsed.message);
  const result = await resetStaffPassword(businessId, userId, (parsed.body as { id?: unknown }).id, request.headers);
  if (!result.ok) throw error(result.code, result.message);
  const { id, tempPassword, username, name } = result.data;

  await recordActivity({
    businessId,
    actor: actorOf(actor),
    ...netOf({ request, getClientAddress }),
    action: 'STAFF_PASSWORD_RESET',
    entityType: 'user',
    entityId: id,
    meta: { username, name }
  });

  return json({ tempPassword });
};

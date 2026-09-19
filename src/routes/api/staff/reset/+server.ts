import { json, error } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { generateTempPassword } from '$lib/server/invites';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

// Reset password staff aktif yang lupa password: owner klik di kolom Aksi,
// server set password sementara (hash scrypt via admin plugin) + cabut semua
// sesi staff itu, lalu password sementara ditampilkan SEKALI ke owner untuk
// diteruskan (mis. via WA). Staff login pakai itu lalu wajib ganti sendiri
// di halaman Akun — owner tidak pernah tahu password final.
//
// Beda dengan "Kirim ulang" di tabel Undangan Pending (itu untuk akun yang
// BELUM jadi — link invite baru, bukan password).
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user || locals.user.role !== 'OWNER') {
    throw error(403, 'Cuma Owner yang bisa me-reset password staff.');
  }
  const businessId = locals.user.businessId as string | null;
  if (!businessId) {
    throw error(400, 'Akun ini belum terhubung ke business manapun.');
  }

  const body = await request.json().catch(() => ({}));
  const id = typeof (body as { id?: unknown }).id === 'string' ? (body as { id: string }).id : '';
  if (!id) throw error(400, 'Id staff wajib diisi.');
  if (id === locals.user.id) throw error(400, 'Ganti password sendiri lewat halaman Akun.');

  const [target] = await db
    .select({ id: user.id, role: user.role, businessId: user.businessId })
    .from(user)
    .where(and(eq(user.id, id), eq(user.businessId, businessId)));
  if (!target) throw error(404, 'Staff tidak ditemukan.');
  if (target.role !== 'STAFF') throw error(400, 'Hanya akun STAFF yang bisa di-reset di sini.');

  const tempPassword = generateTempPassword();

  // headers: teruskan cookie sesi owner — endpoint admin menolak tanpa sesi admin.
  await auth.api.setUserPassword({
    body: { userId: id, newPassword: tempPassword },
    headers: request.headers
  });
  // Sesi lama (mis. di HP staff yang hilang) langsung mati — cuma login baru
  // pakai password sementara yang bisa masuk.
  await auth.api.revokeUserSessions({ body: { userId: id }, headers: request.headers });

  return json({ tempPassword });
};

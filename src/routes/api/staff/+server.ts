import { json, error } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { transaction, user } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';

function requireOwner(locals: App.Locals) {
  if (!locals.user || locals.user.role !== 'OWNER') {
    throw error(403, 'Cuma Owner yang bisa mengelola staff.');
  }
  if (!locals.user.businessId) {
    throw error(400, 'Akun ini belum terhubung ke business manapun.');
  }
}

// Setara app/api/staff/route.ts versi Next: cuma Owner yang boleh nambah staff
// baru buat businessnya sendiri.
export const POST: RequestHandler = async ({ request, locals }) => {
  requireOwner(locals);

  const body = await request.json();
  const { email, password, name } = body as { email: string; password: string; name?: string };

  if (!email?.trim() || !password) {
    throw error(400, 'Email dan password wajib diisi.');
  }
  if (password.length < 6) {
    throw error(400, 'Password minimal 6 karakter.');
  }

  let signUpResult;
  try {
    signUpResult = await auth.api.signUpEmail({
      body: { email: email.trim(), password, name: name?.trim() || email.split('@')[0] }
    });
  } catch {
    throw error(409, 'Email sudah terdaftar.');
  }

  await db
    .update(user)
    .set({ role: 'STAFF', businessId: locals.user!.businessId as string })
    .where(eq(user.id, signUpResult.user.id));

  return json({ id: signUpResult.user.id, email: email.trim(), role: 'STAFF' }, { status: 201 });
};

// Hapus staff dari bisnis. Baris user dihapus (termasuk sesi+kredensial via
// cascade), tapi riwayat transaksi tetap menampilkan nama karena setiap
// struk menyimpan snapshot cashier_name + FK transaction.user_id ON DELETE
// SET NULL (bukan hard-block).
export const DELETE: RequestHandler = async ({ request, locals }) => {
  requireOwner(locals);
  const businessId = locals.user!.businessId as string;

  const body = await request.json().catch(() => ({}));
  const id = typeof (body as { id?: unknown }).id === 'string' ? (body as { id: string }).id : '';
  if (!id) throw error(400, 'Id staff wajib diisi.');
  if (id === locals.user!.id) throw error(400, 'Tidak bisa menghapus akun sendiri.');

  const [target] = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId })
    .from(user)
    .where(and(eq(user.id, id), eq(user.businessId, businessId)));
  if (!target) throw error(404, 'Staff tidak ditemukan.');
  if (target.role !== 'STAFF') throw error(400, 'Hanya akun STAFF yang bisa dihapus di sini.');

  // Snapshot pengaman: pastikan semua struk staff ini punya cashier_name
  // sebelum baris user dihapus (backfill migration sudah mengisi data lama,
  // ini menutup race struk yang dibuat di antara migrate dan hapus).
  await db
    .update(transaction)
    .set({ cashierName: target.name ?? target.email.split('@')[0] })
    .where(and(eq(transaction.userId, id), isNull(transaction.cashierName)));
  await db.delete(user).where(eq(user.id, id));

  return json({ id });
};

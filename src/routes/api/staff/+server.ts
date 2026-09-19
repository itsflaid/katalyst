import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { staffInvitation, transaction, user } from '$lib/server/db/schema';
import { generateInviteToken, hashInviteToken, normalizeEmail, INVITE_TTL_MS } from '$lib/server/invites';
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

// Buat undangan staff (bukan user langsung): owner input nama+email,
// staff bikin password sendiri via link /invite/[token]. Role dikunci
// STAFF di record invite. Token mentah dikembalikan SEKALI ke owner
// untuk diteruskan via WA; di DB cuma hash-nya yang disimpan.
export const POST: RequestHandler = async ({ request, locals }) => {
  requireOwner(locals);
  const businessId = locals.user!.businessId as string;

  const body = await request.json().catch(() => ({}));
  const { email: rawEmail, name: rawName } = body as { email?: string; name?: string };

  const email = typeof rawEmail === 'string' ? normalizeEmail(rawEmail) : '';
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw error(400, 'Email tidak valid.');
  }

  // Email unik global (kolom user.email unique) — cegah konflik sejak invite.
  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email));
  if (existingUser) {
    throw error(409, 'Email sudah terdaftar.');
  }

  // Supersede: invite pending lama untuk email yang sama di bisnis ini
  // langsung di-revoke begitu invite baru terbit (link lama mati seketika).
  const pending = await db
    .select({ id: staffInvitation.id })
    .from(staffInvitation)
    .where(
      and(
        eq(staffInvitation.businessId, businessId),
        eq(staffInvitation.email, email),
        isNull(staffInvitation.acceptedAt),
        isNull(staffInvitation.revokedAt)
      )
    );
  const now = new Date();
  for (const p of pending) {
    await db.update(staffInvitation).set({ revokedAt: now }).where(eq(staffInvitation.id, p.id));
  }

  const rawToken = generateInviteToken();
  const tokenHash = await hashInviteToken(rawToken);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await db.insert(staffInvitation).values({
    id,
    businessId,
    email,
    name: name || email.split('@')[0],
    tokenHash,
    expiresAt,
    invitedBy: locals.user!.id as string
  });

  return json({ id, email, name: name || null, token: rawToken, expiresAt: expiresAt.toISOString() }, { status: 201 });
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

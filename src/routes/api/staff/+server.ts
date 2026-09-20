import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { staffInvitation, transaction, user } from '$lib/server/db/schema';
import { generateInviteToken, hashInviteToken, normalizeUsername, isValidUsername, INVITE_TTL_MS } from '$lib/server/domains/invites';
import { and, eq, isNull, ne } from 'drizzle-orm';
import type { RequestHandler } from './$types';

function requireOwner(locals: App.Locals) {
  if (!locals.user || locals.user.role !== 'OWNER') {
    throw error(403, 'Cuma Owner yang bisa mengelola staff.');
  }
  if (!locals.user.businessId) {
    throw error(400, 'Akun ini belum terhubung ke business manapun.');
  }
}

// Buat undangan staff (bukan user langsung): owner input username+nama,
// staff bikin password sendiri via link /invite/[token]. Role dikunci
// STAFF di record invite. Token mentah dikembalikan SEKALI ke owner
// untuk diteruskan via WA; di DB cuma hash-nya yang disimpan.
export const POST: RequestHandler = async ({ request, locals }) => {
  requireOwner(locals);
  const businessId = locals.user!.businessId as string;

  const body = await request.json().catch(() => ({}));
  const { username: rawUsername, name: rawName } = body as { username?: string; name?: string };

  const username = typeof rawUsername === 'string' ? normalizeUsername(rawUsername) : '';
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!isValidUsername(username)) {
    throw error(400, 'Username 3–20 karakter: huruf kecil, angka, titik, underscore, strip.');
  }

  // Username unik global (kolom user.username unique) — cegah konflik sejak invite.
  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.username, username));
  if (existingUser) {
    throw error(409, 'Username sudah dipakai.');
  }

  // Supersede: invite pending lama untuk username yang sama di bisnis ini
  // langsung di-revoke begitu invite baru terbit (link lama mati seketika).
  const pending = await db
    .select({ id: staffInvitation.id })
    .from(staffInvitation)
    .where(
      and(
        eq(staffInvitation.businessId, businessId),
        eq(staffInvitation.username, username),
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
    username,
    name: name || username,
    tokenHash,
    expiresAt,
    invitedBy: locals.user!.id as string
  });

  return json({ id, username, name: name || null, token: rawToken, expiresAt: expiresAt.toISOString() }, { status: 201 });
};

// Atur/ubah username login staff yang sudah ada (mis. akun lama yang
// dibuat sebelum fitur username). OWNER-only. Username unik global.
export const PATCH: RequestHandler = async ({ request, locals }) => {
  requireOwner(locals);
  const businessId = locals.user!.businessId as string;

  const body = await request.json().catch(() => ({}));
  const { id, username: rawUsername } = body as { id?: unknown; username?: unknown };
  if (typeof id !== 'string' || !id) throw error(400, 'Id staff wajib diisi.');
  const username = typeof rawUsername === 'string' ? normalizeUsername(rawUsername) : '';
  if (!isValidUsername(username)) {
    throw error(400, 'Username 3–20 karakter: huruf kecil, angka, titik, underscore, strip.');
  }

  const [target] = await db
    .select({ id: user.id, role: user.role, businessId: user.businessId })
    .from(user)
    .where(eq(user.id, id));
  if (!target || target.businessId !== businessId) throw error(404, 'Staff tidak ditemukan.');
  if (target.role !== 'STAFF' && target.id !== locals.user!.id) {
    throw error(400, 'Username hanya bisa diatur untuk akun STAFF.');
  }

  const [taken] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.username, username), ne(user.id, target.id)));
  if (taken) throw error(409, 'Username sudah dipakai.');

  try {
    await db.update(user).set({ username }).where(eq(user.id, target.id));
  } catch {
    // Balapan dengan request lain (unique constraint menolak).
    throw error(409, 'Username sudah dipakai.');
  }

  return json({ id: target.id, username });
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
    .select({ id: user.id, name: user.name, username: user.username, role: user.role, businessId: user.businessId })
    .from(user)
    .where(and(eq(user.id, id), eq(user.businessId, businessId)));
  if (!target) throw error(404, 'Staff tidak ditemukan.');
  if (target.role !== 'STAFF') throw error(400, 'Hanya akun STAFF yang bisa dihapus di sini.');

  // Snapshot pengaman: pastikan semua struk staff ini punya cashier_name
  // sebelum baris user dihapus (backfill migration sudah mengisi data lama,
  // ini menutup race struk yang dibuat di antara migrate dan hapus).
  await db
    .update(transaction)
    .set({ cashierName: target.name ?? target.username ?? '—' })
    .where(and(eq(transaction.userId, id), isNull(transaction.cashierName)));
  await db.delete(user).where(eq(user.id, id));

  return json({ id });
};

import { db } from '$lib/server/db';
import { staffInvitation, transaction, user } from '$lib/server/db/schema';
import { runBatch } from '$lib/server/db/batch';
import { auth } from '$lib/server/domains/auth';
import { INVITE_TTL_MS, generateInviteToken, generateTempPassword, hashInviteToken, isValidUsername, normalizeUsername } from '$lib/server/domains/invites';
import { and, eq, isNull, ne } from 'drizzle-orm';

export type StaffResult<T> = { ok: true; data: T } | { ok: false; code: number; message: string };

export interface CreatedInvite {
  id: string;
  username: string;
  name: string;
  token: string;
  expiresAt: Date;
}

export async function createStaffInvite(
  businessId: string,
  invitedBy: string,
  rawUsername: unknown,
  rawName: unknown
): Promise<StaffResult<CreatedInvite>> {
  const username = typeof rawUsername === 'string' ? normalizeUsername(rawUsername) : '';
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!isValidUsername(username)) {
    return { ok: false, code: 400, message: 'Username 3–20 karakter: huruf kecil, angka, titik, underscore, strip.' };
  }

  const [existingUser] = await db.select({ id: user.id }).from(user).where(eq(user.username, username));
  if (existingUser) {
    return { ok: false, code: 409, message: 'Username sudah dipakai.' };
  }

  const pending = await db
    .select({ id: staffInvitation.id })
    .from(staffInvitation)
    // Supersede: invite pending lama untuk username yang sama di bisnis ini
    // langsung di-revoke begitu invite baru terbit (link lama mati seketika).
    .where(
      and(
        eq(staffInvitation.businessId, businessId),
        eq(staffInvitation.username, username),
        isNull(staffInvitation.acceptedAt),
        isNull(staffInvitation.revokedAt)
      )
    );
  const now = new Date();
  const rawToken = generateInviteToken();
  const tokenHash = await hashInviteToken(rawToken);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await runBatch([
    ...pending.map((p) => db.update(staffInvitation).set({ revokedAt: now }).where(eq(staffInvitation.id, p.id))),
    db.insert(staffInvitation).values({
      id,
      businessId,
      username,
      name: name || username,
      tokenHash,
      expiresAt,
      invitedBy
    })
  ]);
  return { ok: true, data: { id, username, name, token: rawToken, expiresAt } };
}

export interface RenamedStaff {
  id: string;
  username: string;
  oldUsername: string | null;
  name: string | null;
}

export async function renameStaffUsername(
  businessId: string,
  callerId: string,
  rawId: unknown,
  rawUsername: unknown
): Promise<StaffResult<RenamedStaff>> {
  if (typeof rawId !== 'string' || !rawId) return { ok: false, code: 400, message: 'Id staff wajib diisi.' };
  const username = typeof rawUsername === 'string' ? normalizeUsername(rawUsername) : '';
  if (!isValidUsername(username)) {
    return { ok: false, code: 400, message: 'Username 3–20 karakter: huruf kecil, angka, titik, underscore, strip.' };
  }

  const [target] = await db
    .select({ id: user.id, name: user.name, username: user.username, role: user.role, businessId: user.businessId })
    .from(user)
    .where(eq(user.id, rawId));
  if (!target || target.businessId !== businessId) return { ok: false, code: 404, message: 'Staff tidak ditemukan.' };
  if (target.role !== 'STAFF' && target.id !== callerId) {
    return { ok: false, code: 400, message: 'Username hanya bisa diatur untuk akun STAFF.' };
  }

  const [taken] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.username, username), ne(user.id, target.id)));
  if (taken) return { ok: false, code: 409, message: 'Username sudah dipakai.' };

  try {
    await db.update(user).set({ username }).where(eq(user.id, target.id));
  } catch {
    // Balapan dengan request lain (unique constraint menolak).
    return { ok: false, code: 409, message: 'Username sudah dipakai.' };
  }
  return { ok: true, data: { id: target.id, username, oldUsername: target.username, name: target.name } };
}

export interface DeletedStaff {
  id: string;
  username: string | null;
  name: string | null;
}

export async function deleteStaff(businessId: string, callerId: string, rawId: unknown): Promise<StaffResult<DeletedStaff>> {
  if (typeof rawId !== 'string' || !rawId) return { ok: false, code: 400, message: 'Id staff wajib diisi.' };
  if (rawId === callerId) return { ok: false, code: 400, message: 'Tidak bisa menghapus akun sendiri.' };

  const [target] = await db
    .select({ id: user.id, name: user.name, username: user.username, role: user.role, businessId: user.businessId })
    .from(user)
    .where(and(eq(user.id, rawId), eq(user.businessId, businessId)));
  if (!target) return { ok: false, code: 404, message: 'Staff tidak ditemukan.' };
  if (target.role !== 'STAFF') return { ok: false, code: 400, message: 'Hanya akun STAFF yang bisa dihapus di sini.' };

  // Snapshot pengaman: pastikan semua struk staff ini punya cashier_name
  // sebelum baris user dihapus (backfill migration sudah mengisi data lama,
  // ini menutup race struk yang dibuat di antara migrate dan hapus).
  await db
    .update(transaction)
    .set({ cashierName: target.name ?? target.username ?? '-' })
    .where(and(eq(transaction.userId, rawId), isNull(transaction.cashierName)));
  await db.delete(user).where(eq(user.id, rawId));

  return { ok: true, data: { id: target.id, username: target.username, name: target.name } };
}

export interface ResetPassword {
  id: string;
  tempPassword: string;
  username: string | null;
  name: string | null;
}

export async function resetStaffPassword(
  businessId: string,
  callerId: string,
  rawId: unknown,
  headers: Headers
): Promise<StaffResult<ResetPassword>> {
  if (typeof rawId !== 'string' || !rawId) return { ok: false, code: 400, message: 'Id staff wajib diisi.' };
  if (rawId === callerId) return { ok: false, code: 400, message: 'Ganti password sendiri lewat halaman Akun.' };

  const [target] = await db
    .select({ id: user.id, name: user.name, username: user.username, role: user.role, businessId: user.businessId })
    .from(user)
    .where(and(eq(user.id, rawId), eq(user.businessId, businessId)));
  if (!target) return { ok: false, code: 404, message: 'Staff tidak ditemukan.' };
  if (target.role !== 'STAFF') return { ok: false, code: 400, message: 'Hanya akun STAFF yang bisa di-reset di sini.' };

  const tempPassword = generateTempPassword();

  // headers: teruskan cookie sesi owner, endpoint admin menolak tanpa sesi admin.
  // Sesi lama langsung mati, cuma login baru pakai password sementara yang bisa masuk.
  await auth.api.setUserPassword({
    body: { userId: rawId, newPassword: tempPassword },
    headers
  });
  await auth.api.revokeUserSessions({ body: { userId: rawId }, headers });

  return { ok: true, data: { id: target.id, tempPassword, username: target.username, name: target.name } };
}

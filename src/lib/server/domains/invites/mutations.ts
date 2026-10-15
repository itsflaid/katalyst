import { db } from '$lib/server/db';
import { business, staffInvitation, user } from '$lib/server/db/schema';
import { runBatch } from '$lib/server/db/batch';
import { auth } from '$lib/server/domains/auth';
import { INVITE_TTL_MS, generateInviteToken, hashInviteToken, placeholderEmail } from '$lib/server/domains/invites';
import { and, eq, isNull } from 'drizzle-orm';

export type InviteResult<T> = { ok: true; data: T } | { ok: false; code: number; message: string; flag?: 'invalid' | 'expired' };

interface PendingInvite {
  id: string;
  username: string;
  name: string | null;
}

async function findPendingInvite(inviteId: string, businessId: string): Promise<PendingInvite | null> {
  const [invite] = await db
    .select({
      id: staffInvitation.id,
      username: staffInvitation.username,
      name: staffInvitation.name,
      acceptedAt: staffInvitation.acceptedAt,
      revokedAt: staffInvitation.revokedAt
    })
    .from(staffInvitation)
    .where(and(eq(staffInvitation.id, inviteId), eq(staffInvitation.businessId, businessId)));
  if (!invite || invite.acceptedAt || invite.revokedAt) return null;
  return { id: invite.id, username: invite.username, name: invite.name };
}

export interface ResentInvite {
  id: string;
  username: string;
  name: string | null;
  token: string;
  expiresAt: Date;
}

export async function resendInvite(businessId: string, invitedBy: string, rawInviteId: unknown): Promise<InviteResult<ResentInvite>> {
  if (typeof rawInviteId !== 'string' || !rawInviteId) return { ok: false, code: 400, message: 'inviteId wajib diisi.' };

  const invite = await findPendingInvite(rawInviteId, businessId);
  if (!invite) return { ok: false, code: 404, message: 'Undangan tidak ditemukan atau sudah tidak berlaku.' };

  const [existingUser] = await db.select({ id: user.id }).from(user).where(eq(user.username, invite.username));
  if (existingUser) {
    // Bersih-bersih: username keburu dipakai, cabut invite.
    await db.update(staffInvitation).set({ revokedAt: new Date() }).where(eq(staffInvitation.id, invite.id));
    return { ok: false, code: 409, message: 'Username sudah dipakai.' };
  }

  const rawToken = generateInviteToken();
  const tokenHash = await hashInviteToken(rawToken);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await runBatch([
    db.update(staffInvitation).set({ revokedAt: new Date() }).where(eq(staffInvitation.id, invite.id)),
    db.insert(staffInvitation).values({
      id,
      businessId,
      username: invite.username,
      name: invite.name,
      tokenHash,
      expiresAt,
      invitedBy
    })
  ]);

  return { ok: true, data: { id, username: invite.username, name: invite.name, token: rawToken, expiresAt } };
}

export interface RevokedInvite {
  id: string;
  username: string;
  name: string | null;
}

export async function revokeInvite(businessId: string, rawInviteId: unknown): Promise<InviteResult<RevokedInvite>> {
  if (typeof rawInviteId !== 'string' || !rawInviteId) return { ok: false, code: 400, message: 'inviteId wajib diisi.' };

  const invite = await findPendingInvite(rawInviteId, businessId);
  if (!invite) return { ok: false, code: 404, message: 'Undangan tidak ditemukan atau sudah tidak berlaku.' };
  await db.update(staffInvitation).set({ revokedAt: new Date() }).where(eq(staffInvitation.id, invite.id));

  return { ok: true, data: { id: invite.id, username: invite.username, name: invite.name } };
}

export type InviteStatus = 'valid' | 'expired' | 'invalid';

export type InviteCard =
  | { status: 'invalid' }
  | { status: 'expired'; businessName: string; username: string }
  | { status: 'valid'; businessName: string; username: string; name: string; expiresAt: string };

export async function getInviteCard(rawToken: unknown): Promise<InviteCard> {
  if (typeof rawToken !== 'string' || !rawToken) return { status: 'invalid' };
  const tokenHash = await hashInviteToken(rawToken);
  const [invite] = await db.select().from(staffInvitation).where(eq(staffInvitation.tokenHash, tokenHash));
  if (!invite || invite.acceptedAt || invite.revokedAt) {
    return { status: 'invalid' };
  }
  const [b] = await db.select({ name: business.name }).from(business).where(eq(business.id, invite.businessId));
  const businessName = b?.name ?? 'Bisnis';
  if (invite.expiresAt.getTime() < Date.now()) {
    return { status: 'expired', businessName, username: invite.username };
  }
  return {
    status: 'valid',
    businessName,
    username: invite.username,
    name: invite.name ?? '',
    expiresAt: invite.expiresAt.toISOString()
  };
}

export interface AcceptedInvite {
  userId: string | undefined;
  username: string;
  name: string;
  businessId: string;
}

export async function acceptInvite(
  rawToken: unknown,
  rawPassword: unknown,
  rawConfirm: unknown,
  rawName: unknown
): Promise<InviteResult<AcceptedInvite>> {
  if (typeof rawToken !== 'string' || !rawToken) {
    return { ok: false, code: 400, message: 'Undangan tidak berlaku. Minta link baru ke owner.', flag: 'invalid' };
  }
  const tokenHash = await hashInviteToken(rawToken);
  const [invite] = await db.select().from(staffInvitation).where(eq(staffInvitation.tokenHash, tokenHash));
  // Pesan generik untuk semua link mati, jangan bocorkan alasan
  // (expired vs dicabut vs sudah dipakai) ke pemegang link.
  if (!invite || invite.acceptedAt || invite.revokedAt) {
    return { ok: false, code: 400, message: 'Undangan tidak berlaku. Minta link baru ke owner.', flag: 'invalid' };
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return { ok: false, code: 400, message: 'Undangan kedaluwarsa. Minta link baru ke owner.', flag: 'expired' };
  }

  const password = typeof rawPassword === 'string' ? rawPassword : '';
  const confirm = typeof rawConfirm === 'string' ? rawConfirm : '';
  const name = (typeof rawName === 'string' && rawName.trim()) || invite.name || invite.username;

  if (password.length < 6) {
    return { ok: false, code: 400, message: 'Password minimal 6 karakter.' };
  }
  if (password !== confirm) {
    return { ok: false, code: 400, message: 'Konfirmasi password tidak cocok.' };
  }

  const [existingUser] = await db.select({ id: user.id }).from(user).where(eq(user.username, invite.username));
  if (existingUser) {
    return { ok: false, code: 409, message: 'Username ini sudah dipakai. Silakan masuk.' };
  }

  try {
    // Kolom user.email NOT NULL (wajib struktural better-auth) tapi tak ada user yang wajib punya email beneran: pakai email sintetis (domain reserved).
    // Login selalu via username, email ini tak pernah ditampilkan.
    // createUser tanpa sesi menulis role STAFF sejak awal: tanpa jendela OWNER tanpa bisnis.
    await auth.api.createUser({
      body: {
        email: placeholderEmail(invite.username),
        password,
        name,
        role: 'STAFF',
        data: { username: invite.username, businessId: invite.businessId }
      }
    });
  } catch {
    // Bedakan duplikat beneran (race: username dibuat di sela cek dan signup) dari kegagalan lain; pesan "dipakai" untuk error sembarang menutupi bug beneran.
    const [raced] = await db.select({ id: user.id }).from(user).where(eq(user.username, invite.username));
    if (raced) return { ok: false, code: 409, message: 'Username ini sudah dipakai. Silakan masuk.' };
    return { ok: false, code: 500, message: 'Gagal membuat akun, coba lagi.' };
  }

  await db.update(staffInvitation).set({ acceptedAt: new Date() }).where(eq(staffInvitation.id, invite.id));

  const [joined] = await db.select({ id: user.id }).from(user).where(eq(user.username, invite.username));
  return { ok: true, data: { userId: joined?.id, username: invite.username, name, businessId: invite.businessId } };
}

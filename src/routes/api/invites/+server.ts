import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { staffInvitation, user } from '$lib/server/db/schema';
import { generateInviteToken, hashInviteToken, INVITE_TTL_MS } from '$lib/server/domains/invites';
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

async function findPendingInvite(inviteId: string, businessId: string) {
  const [invite] = await db
    .select()
    .from(staffInvitation)
    .where(and(eq(staffInvitation.id, inviteId), eq(staffInvitation.businessId, businessId)));
  if (!invite || invite.acceptedAt || invite.revokedAt) {
    throw error(404, 'Undangan tidak ditemukan atau sudah tidak berlaku.');
  }
  return invite;
}

// Kirim ulang = revoke token lama + terbitkan token baru (link lama mati
// seketika). Dipakai untuk invite kedaluwarsa maupun link yang hilang.
export const POST: RequestHandler = async ({ request, locals }) => {
  requireOwner(locals);
  const businessId = locals.user!.businessId as string;

  const body = await request.json().catch(() => ({}));
  const inviteId = typeof (body as { inviteId?: unknown }).inviteId === 'string' ? (body as { inviteId: string }).inviteId : '';
  if (!inviteId) throw error(400, 'inviteId wajib diisi.');

  const invite = await findPendingInvite(inviteId, businessId);

  const [existingUser] = await db.select({ id: user.id }).from(user).where(eq(user.username, invite.username));
  if (existingUser) {
    // Bersih-bersih: username keburu dipakai — cabut invite.
    await db.update(staffInvitation).set({ revokedAt: new Date() }).where(eq(staffInvitation.id, invite.id));
    throw error(409, 'Username sudah dipakai.');
  }

  const rawToken = generateInviteToken();
  const tokenHash = await hashInviteToken(rawToken);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await db.update(staffInvitation).set({ revokedAt: new Date() }).where(eq(staffInvitation.id, invite.id));
  await db.insert(staffInvitation).values({
    id,
    businessId,
    username: invite.username,
    name: invite.name,
    tokenHash,
    expiresAt,
    invitedBy: locals.user!.id as string
  });

  return json({ id, username: invite.username, token: rawToken, expiresAt: expiresAt.toISOString() }, { status: 201 });
};

// Cabut undangan — link langsung mati dengan error generik yang sama
// kayak expired (jangan bocorkan alasan ke pemegang link).
export const DELETE: RequestHandler = async ({ request, locals }) => {
  requireOwner(locals);
  const businessId = locals.user!.businessId as string;

  const body = await request.json().catch(() => ({}));
  const inviteId = typeof (body as { inviteId?: unknown }).inviteId === 'string' ? (body as { inviteId: string }).inviteId : '';
  if (!inviteId) throw error(400, 'inviteId wajib diisi.');

  const invite = await findPendingInvite(inviteId, businessId);
  await db.update(staffInvitation).set({ revokedAt: new Date() }).where(eq(staffInvitation.id, invite.id));

  return json({ id: invite.id });
};

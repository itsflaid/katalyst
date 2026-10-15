import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { readJsonObject } from '$lib/server/http';
import { staffInvitation, user } from '$lib/server/db/schema';
import { generateInviteToken, hashInviteToken, INVITE_TTL_MS } from '$lib/server/domains/invites';
import { actorOf, netOf, recordActivity } from '$lib/server/domains/activity/log';
import { requireOwner } from '$lib/server/domains/auth/guards';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';

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

// Kirim ulang me-revoke token lama dan menerbitkan token baru (link lama mati seketika).
// Dipakai untuk invite kedaluwarsa maupun link yang hilang.
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  const { businessId, userId, user: actor } = requireOwner(locals);

  const parsed = await readJsonObject(request);
  if (!parsed.ok) throw error(400, parsed.message);
  const inviteId = typeof (parsed.body as { inviteId?: unknown }).inviteId === 'string' ? (parsed.body as { inviteId: string }).inviteId : '';
  if (!inviteId) throw error(400, 'inviteId wajib diisi.');

  const invite = await findPendingInvite(inviteId, businessId);

  const [existingUser] = await db.select({ id: user.id }).from(user).where(eq(user.username, invite.username));
  if (existingUser) {
    // Bersih-bersih: username keburu dipakai, cabut invite.
    await db.update(staffInvitation).set({ revokedAt: new Date() }).where(eq(staffInvitation.id, invite.id));
    throw error(409, 'Username sudah dipakai.');
  }

  const rawToken = generateInviteToken();
  const tokenHash = await hashInviteToken(rawToken);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  // Revoke lama + terbit baru dalam satu transaksi: gagal satu = batal semua.
  await db.batch([
    db.update(staffInvitation).set({ revokedAt: new Date() }).where(eq(staffInvitation.id, invite.id)),
    db.insert(staffInvitation).values({
      id,
      businessId,
      username: invite.username,
      name: invite.name,
      tokenHash,
      expiresAt,
      invitedBy: userId
    })
  ]);

  await recordActivity({
    businessId,
    actor: actorOf(actor),
    ...netOf({ request, getClientAddress }),
    action: 'INVITE_RESEND',
    entityType: 'staff_invitation',
    entityId: id,
    meta: { username: invite.username, name: invite.name }
  });

  return json({ id, username: invite.username, token: rawToken, expiresAt: expiresAt.toISOString() }, { status: 201 });
};

// Cabut undangan: link langsung mati dengan error generik (jangan bocorkan alasan ke pemegang link).
export const DELETE: RequestHandler = async ({ request, locals, getClientAddress }) => {
  const { businessId, user: actor } = requireOwner(locals);

  const parsedDelete = await readJsonObject(request);
  if (!parsedDelete.ok) throw error(400, parsedDelete.message);
  const inviteId =
    typeof (parsedDelete.body as { inviteId?: unknown }).inviteId === 'string' ? (parsedDelete.body as { inviteId: string }).inviteId : '';
  if (!inviteId) throw error(400, 'inviteId wajib diisi.');

  const invite = await findPendingInvite(inviteId, businessId);
  await db.update(staffInvitation).set({ revokedAt: new Date() }).where(eq(staffInvitation.id, invite.id));

  await recordActivity({
    businessId,
    actor: actorOf(actor),
    ...netOf({ request, getClientAddress }),
    action: 'INVITE_REVOKE',
    entityType: 'staff_invitation',
    entityId: invite.id,
    meta: { username: invite.username, name: invite.name }
  });

  return json({ id: invite.id });
};

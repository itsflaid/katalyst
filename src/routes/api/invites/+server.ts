import { json, error } from '@sveltejs/kit';
import { readJsonObject } from '$lib/server/http';
import { resendInvite, revokeInvite } from '$lib/server/domains/invites';
import { actorOf, netOf, recordActivity } from '$lib/server/domains/activity/log';
import { requireOwner } from '$lib/server/domains/auth/guards';
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
  const result = await resendInvite(businessId, userId, (parsed.body as { inviteId?: unknown }).inviteId);
  if (!result.ok) throw error(result.code, result.message);
  const { id, username, name, token, expiresAt } = result.data;

  await recordActivity({
    businessId,
    actor: actorOf(actor),
    ...netOf({ request, getClientAddress }),
    action: 'INVITE_RESEND',
    entityType: 'staff_invitation',
    entityId: id,
    meta: { username, name }
  });

  return json({ id, username, token, expiresAt: expiresAt.toISOString() }, { status: 201 });
};

// Cabut undangan: link langsung mati dengan error generik (jangan bocorkan alasan ke pemegang link).
export const DELETE: RequestHandler = async ({ request, locals, getClientAddress }) => {
  const { businessId, user: actor } = requireOwner(locals);

  const parsedDelete = await readJsonObject(request);
  if (!parsedDelete.ok) throw error(400, parsedDelete.message);
  const result = await revokeInvite(businessId, (parsedDelete.body as { inviteId?: unknown }).inviteId);
  if (!result.ok) throw error(result.code, result.message);
  const { id, username, name } = result.data;

  await recordActivity({
    businessId,
    actor: actorOf(actor),
    ...netOf({ request, getClientAddress }),
    action: 'INVITE_REVOKE',
    entityType: 'staff_invitation',
    entityId: id,
    meta: { username, name }
  });

  return json({ id });
};

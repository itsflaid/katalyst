import { json, error } from '@sveltejs/kit';
import { readJsonObject } from '$lib/server/http';
import { actorOf, netOf, recordActivity } from '$lib/server/domains/activity/log';
import { requireOwner } from '$lib/server/domains/auth/guards';
import { createStaffInvite, deleteStaff, renameStaffUsername } from '$lib/server/domains/staff';
import type { RequestHandler } from './$types';

// Buat undangan staff (bukan user langsung): owner input username+nama, staff bikin password sendiri via link /invite/[token].
// Role dikunci STAFF di record invite. Token mentah dikembalikan sekali ke owner; di DB cuma hash-nya yang disimpan.
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  const { businessId, userId, user: actor } = requireOwner(locals);

  const parsed = await readJsonObject(request);
  if (!parsed.ok) throw error(400, parsed.message);
  const body = parsed.body as { username?: unknown; name?: unknown };
  const result = await createStaffInvite(businessId, userId, body.username, body.name);
  if (!result.ok) throw error(result.code, result.message);
  const { id, username, name, token, expiresAt } = result.data;

  await recordActivity({
    businessId,
    actor: actorOf(actor),
    ...netOf({ request, getClientAddress }),
    action: 'STAFF_INVITE',
    entityType: 'staff_invitation',
    entityId: id,
    meta: { username, name: name || null }
  });

  return json({ id, username, name: name || null, token, expiresAt: expiresAt.toISOString() }, { status: 201 });
};

// Atur/ubah username login staff yang sudah ada. OWNER-only. Username unik global.
export const PATCH: RequestHandler = async ({ request, locals, getClientAddress }) => {
  const { businessId, userId, user: actor } = requireOwner(locals);

  const parsedPatch = await readJsonObject(request);
  if (!parsedPatch.ok) throw error(400, parsedPatch.message);
  const body = parsedPatch.body as { id?: unknown; username?: unknown };
  const result = await renameStaffUsername(businessId, userId, body.id, body.username);
  if (!result.ok) throw error(result.code, result.message);
  const { id, username, oldUsername, name } = result.data;

  await recordActivity({
    businessId,
    actor: actorOf(actor),
    ...netOf({ request, getClientAddress }),
    action: 'STAFF_USERNAME_CHANGE',
    entityType: 'user',
    entityId: id,
    meta: { username, oldUsername, name }
  });

  return json({ id, username });
};

// Hapus staff dari bisnis. Baris user dihapus (termasuk sesi+kredensial via cascade);
// riwayat transaksi tetap tampil nama via snapshot cashier_name + FK ON DELETE SET NULL.
export const DELETE: RequestHandler = async ({ request, locals, getClientAddress }) => {
  const { businessId, userId, user: actor } = requireOwner(locals);

  const parsedDelete = await readJsonObject(request);
  if (!parsedDelete.ok) throw error(400, parsedDelete.message);
  const result = await deleteStaff(businessId, userId, (parsedDelete.body as { id?: unknown }).id);
  if (!result.ok) throw error(result.code, result.message);
  const { id, username, name } = result.data;

  // entityId tanpa FK sehingga aman dicatat setelah baris user terhapus.
  await recordActivity({
    businessId,
    actor: actorOf(actor),
    ...netOf({ request, getClientAddress }),
    action: 'STAFF_DELETE',
    entityType: 'user',
    entityId: id,
    meta: { username, name }
  });

  return json({ id });
};

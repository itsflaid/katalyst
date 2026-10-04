import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { countedDb } from '$lib/server/domains/copilot/db';
import { SubrequestBudget } from '$lib/server/domains/copilot/budget';
import {
  createConversation,
  deleteAllConversations,
  listConversations
} from '$lib/server/domains/copilot/history';

function guard(locals: App.Locals, origin: string | null, url: URL, write: boolean): Response | null {
  if (!locals.user) return Response.json({ error: 'Belum masuk. Silakan login dulu.' }, { status: 401 });
  if ((locals.user as { role?: unknown }).role !== 'OWNER') {
    return Response.json({ error: 'Hanya owner yang boleh memakai Copilot.' }, { status: 403 });
  }
  if (!locals.business) return Response.json({ error: 'Bisnis tidak ditemukan.' }, { status: 403 });
  if (write && (!origin || origin !== url.origin)) {
    return Response.json({ error: 'Origin tidak diizinkan.' }, { status: 403 });
  }
  if (!write && origin && origin !== url.origin) {
    return Response.json({ error: 'Origin tidak diizinkan.' }, { status: 403 });
  }
  return null;
}

export const GET: RequestHandler = async ({ url, locals }) => {
  const denied = guard(locals, null, url, false);
  if (denied) return denied;
  const businessId = locals.business?.id as string;
  const requestDb = countedDb(env.DATABASE_URL ?? '', new SubrequestBudget());
  const items = await listConversations(requestDb, businessId);
  return Response.json({
    conversations: items.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.getTime() }))
  });
};

export const POST: RequestHandler = async ({ request, url, locals }) => {
  const denied = guard(locals, request.headers.get('origin'), url, true);
  if (denied) return denied;
  const businessId = locals.business?.id as string;
  const requestDb = countedDb(env.DATABASE_URL ?? '', new SubrequestBudget());
  const row = await createConversation(requestDb, businessId, globalThis.crypto.randomUUID());
  return Response.json({ id: row.id, title: row.title, updatedAt: row.updatedAt.getTime() }, { status: 201 });
};

export const DELETE: RequestHandler = async ({ request, url, locals }) => {
  const denied = guard(locals, request.headers.get('origin'), url, true);
  if (denied) return denied;
  const businessId = locals.business?.id as string;
  const requestDb = countedDb(env.DATABASE_URL ?? '', new SubrequestBudget());
  const deleted = await deleteAllConversations(requestDb, businessId);
  return Response.json({ deleted });
};

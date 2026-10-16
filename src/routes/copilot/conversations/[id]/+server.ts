import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { countedDb } from '$lib/server/domains/copilot/db';
import { SubrequestBudget } from '$lib/server/domains/copilot/budget';
import { deleteConversation, getConversation } from '$lib/server/domains/copilot/history';
import { requireTenant } from '$lib/server/domains/auth/guards';

function guard(locals: App.Locals, origin: string | null, url: URL, write: boolean): Response | null {
  if (!locals.user) return Response.json({ error: 'Belum masuk. Silakan login dulu.' }, { status: 401 });
  // Balasan JSON dibaca client dari body.error; alasan guard tetap lokal walau role diambil dari Tenant.
  const { role } = requireTenant(locals);
  if (role !== 'OWNER') {
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

export const GET: RequestHandler = async ({ url, locals, params }) => {
  const denied = guard(locals, null, url, false);
  if (denied) return denied;
  const businessId = locals.business?.id;
  if (!businessId) return Response.json({ error: 'Bisnis tidak ditemukan.' }, { status: 403 });
  const requestDb = countedDb(env.DATABASE_URL ?? '', new SubrequestBudget());
  const found = await getConversation(requestDb, businessId, params.id);
  if (!found) return Response.json({ error: 'Percakapan tidak ditemukan.' }, { status: 404 });
  return Response.json({
    conversation: { id: found.conversation.id, title: found.conversation.title, updatedAt: found.conversation.updatedAt.getTime() },
    messages: found.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolName: m.toolName,
      toolResult: m.toolResult,
      createdAt: m.createdAt.getTime()
    }))
  });
};

export const DELETE: RequestHandler = async ({ request, url, locals, params }) => {
  const denied = guard(locals, request.headers.get('origin'), url, true);
  if (denied) return denied;
  const businessId = locals.business?.id;
  if (!businessId) return Response.json({ error: 'Bisnis tidak ditemukan.' }, { status: 403 });
  const requestDb = countedDb(env.DATABASE_URL ?? '', new SubrequestBudget());
  const ok = await deleteConversation(requestDb, businessId, params.id);
  if (!ok) return Response.json({ error: 'Percakapan tidak ditemukan.' }, { status: 404 });
  return Response.json({ deleted: true });
};

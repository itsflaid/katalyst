import { json, error } from '@sveltejs/kit';
import { readJsonObject } from '$lib/server/http';
import { renameAccount } from '$lib/server/domains/auth/account';
import { requireTenant } from '$lib/server/domains/auth/guards';
import type { RequestHandler } from './$types';

// Self-service: user login (role apa pun) boleh ganti namanya sendiri.
// Email sengaja tidak bisa diganti di sini (identitas login better-auth, terikat tabel `account`).
export const PATCH: RequestHandler = async ({ request, locals }) => {
  const { userId } = requireTenant(locals);

  const parsed = await readJsonObject(request);
  if (!parsed.ok) throw error(400, parsed.message);
  const result = await renameAccount(userId, (parsed.body as { name?: unknown }).name);
  if (!result.ok) throw error(result.code, result.message);

  // Catatan audit: struk lama tetap menampilkan nama lama (snapshot
  // cashier_name), struk baru pakai nama baru. Tidak ada backfill massal.
  return json({ name: result.name });
};

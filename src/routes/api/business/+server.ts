import { json, error } from '@sveltejs/kit';
import { readJsonObject } from '$lib/server/http';
import { updateBusinessProfile } from '$lib/server/domains/business';
import { requireOwner } from '$lib/server/domains/auth/guards';
import type { RequestHandler } from './$types';

// Cuma Owner yang boleh ubah profil bisnis; mendukung update parsial nama dan/atau zona waktu.
export const PATCH: RequestHandler = async ({ request, locals }) => {
  const { businessId } = requireOwner(locals);

  const parsed = await readJsonObject(request);
  if (!parsed.ok) throw error(400, parsed.message);
  const result = await updateBusinessProfile(businessId, parsed.body);
  if (!result.ok) throw error(result.code, result.message);
  return json(result.profile);
};

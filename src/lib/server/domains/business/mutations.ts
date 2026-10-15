import { db } from '$lib/server/db';
import { business } from '$lib/server/db/schema';
import { DEFAULT_TZ, isBizTz, type BizTz } from '$lib/shared/time';
import { eq } from 'drizzle-orm';

export interface BusinessPatch {
  name?: string;
  timezone?: BizTz;
}

export type UpdateBusinessResult = { ok: true; profile: { name: string; timezone: BizTz } } | { ok: false; code: number; message: string };

export async function updateBusinessProfile(businessId: string, body: unknown): Promise<UpdateBusinessResult> {
  const input = body as { name?: unknown; timezone?: unknown };
  const hasName = input.name !== undefined;
  const hasTz = input.timezone !== undefined;
  if (!hasName && !hasTz) {
    return { ok: false, code: 400, message: 'Tidak ada perubahan yang dikirim.' };
  }

  const patch: BusinessPatch = {};
  if (hasName) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) return { ok: false, code: 400, message: 'Nama bisnis tidak boleh kosong.' };
    if (name.length > 100) return { ok: false, code: 400, message: 'Nama bisnis maksimal 100 karakter.' };
    patch.name = name;
  }
  if (hasTz) {
    if (!isBizTz(input.timezone)) return { ok: false, code: 400, message: 'Zona waktu tidak valid.' };
    patch.timezone = input.timezone;
  }

  await db.update(business).set(patch).where(eq(business.id, businessId));
  const [b] = await db.select({ name: business.name, timezone: business.timezone }).from(business).where(eq(business.id, businessId));
  return { ok: true, profile: { name: b?.name ?? patch.name ?? '', timezone: b?.timezone ?? patch.timezone ?? DEFAULT_TZ } };
}

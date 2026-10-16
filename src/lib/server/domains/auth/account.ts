import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export interface AccountProfile {
  name: string;
  username: string;
  role: string | null;
}

export async function getAccountProfile(userId: string): Promise<AccountProfile | null> {
  const [u] = await db.select({ name: user.name, username: user.username, role: user.role }).from(user).where(eq(user.id, userId));
  if (!u) return null;
  return { name: u.name ?? '', username: u.username ?? '', role: u.role };
}

export type RenameAccountResult = { ok: true; name: string } | { ok: false; code: number; message: string };

export async function renameAccount(userId: string, rawName: unknown): Promise<RenameAccountResult> {
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name) {
    return { ok: false, code: 400, message: 'Nama tidak boleh kosong.' };
  }
  if (name.length > 100) {
    return { ok: false, code: 400, message: 'Nama maksimal 100 karakter.' };
  }
  await db.update(user).set({ name }).where(eq(user.id, userId));
  return { ok: true, name };
}

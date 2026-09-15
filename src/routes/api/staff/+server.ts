import { json, error } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

// Setara app/api/staff/route.ts versi Next: cuma Owner yang boleh nambah staff
// baru buat businessnya sendiri.
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user || locals.user.role !== 'OWNER') {
    throw error(403, 'Cuma Owner yang bisa menambahkan staff.');
  }
  if (!locals.user.businessId) {
    throw error(400, 'Akun ini belum terhubung ke business manapun.');
  }

  const body = await request.json();
  const { email, password, name } = body as { email: string; password: string; name?: string };

  if (!email || !password) {
    throw error(400, 'Email dan password wajib diisi.');
  }

  const signUpResult = await auth.api.signUpEmail({
    body: { email, password, name: name ?? email.split('@')[0] }
  });

  await db
    .update(user)
    .set({ role: 'STAFF', businessId: locals.user.businessId })
    .where(eq(user.id, signUpResult.user.id));

  return json({ id: signUpResult.user.id, email, role: 'STAFF' }, { status: 201 });
};

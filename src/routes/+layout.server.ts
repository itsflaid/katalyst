import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { business } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return { user: null, businessName: null };

  // additionalFields better-auth (role/businessId) balik sebagai string biasa,
  // bukan literal type 'OWNER' | 'STAFF' — di-cast di sini, satu tempat,
  // biar Sidebar.svelte gak perlu tau soal ketidaksempurnaan typing ini.
  const role = (session.user.role as 'OWNER' | 'STAFF' | null) ?? 'STAFF';
  const businessId = (session.user.businessId as string | null) ?? null;

  let businessName: string | null = null;
  if (businessId) {
    const [b] = await db.select({ name: business.name }).from(business).where(eq(business.id, businessId));
    businessName = b?.name ?? null;
  }

  return {
    user: { ...session.user, role },
    businessName
  };
};

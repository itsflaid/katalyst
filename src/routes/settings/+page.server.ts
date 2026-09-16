import { db } from '$lib/server/db';
import { business, user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const businessId = locals.user!.businessId as string;
  const [b] = await db.select().from(business).where(eq(business.id, businessId));
  const staffList = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.businessId, businessId));

  return { businessName: b?.name ?? '', staffList };
};

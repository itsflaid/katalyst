import { db } from '$lib/server/db';
import { business } from '$lib/server/db/schema';
import { DEFAULT_TZ, isBizTz, type BizTz } from '$lib/shared/time';
import { eq } from 'drizzle-orm';

export interface BusinessProfile {
  id: string;
  name: string;
  timezone: BizTz;
}

export async function getBusinessById(businessId: string): Promise<BusinessProfile | null> {
  const [b] = await db
    .select({ id: business.id, name: business.name, timezone: business.timezone })
    .from(business)
    .where(eq(business.id, businessId));
  if (!b) return null;
  return { id: b.id, name: b.name, timezone: isBizTz(b.timezone) ? b.timezone : DEFAULT_TZ };
}

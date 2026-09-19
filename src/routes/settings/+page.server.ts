import { db } from '$lib/server/db';
import { business, staffInvitation, user } from '$lib/server/db/schema';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const businessId = locals.user!.businessId as string;
  const [b] = await db.select().from(business).where(eq(business.id, businessId));
  // Urutan tetap: Owner selalu paling atas, di bawahnya staff dari yang
  // terlama ke terbaru (createdAt naik). CASE eksplisit biar tidak
  // bergantung pada urutan alfabet nilai enum.
  const staffList = await db
    .select({ id: user.id, name: user.name, username: user.username, role: user.role })
    .from(user)
    .where(eq(user.businessId, businessId))
    .orderBy(sql`CASE WHEN ${user.role} = 'OWNER' THEN 0 ELSE 1 END`, asc(user.createdAt));
  // Undangan yang masih pending (belum diterima/dicabut, termasuk yang
  // kedaluwarsa — frontend yang memberi badge + tombol kirim ulang).
  const pendingInvites = await db
    .select({
      id: staffInvitation.id,
      username: staffInvitation.username,
      name: staffInvitation.name,
      expiresAt: staffInvitation.expiresAt,
      createdAt: staffInvitation.createdAt
    })
    .from(staffInvitation)
    .where(
      and(
        eq(staffInvitation.businessId, businessId),
        isNull(staffInvitation.acceptedAt),
        isNull(staffInvitation.revokedAt)
      )
    )
    .orderBy(desc(staffInvitation.createdAt));

  return {
    businessName: b?.name ?? '',
    staffList,
    pendingInvites: pendingInvites.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString(), createdAt: i.createdAt.toISOString() })),
    currentUserId: locals.user!.id as string
  };
};
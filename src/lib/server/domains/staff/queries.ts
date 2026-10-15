import { db } from '$lib/server/db';
import { staffInvitation, user } from '$lib/server/db/schema';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

export interface StaffRow {
  id: string;
  name: string | null;
  username: string | null;
  role: string;
}

export async function listStaff(businessId: string): Promise<StaffRow[]> {
  return db
    .select({ id: user.id, name: user.name, username: user.username, role: user.role })
    .from(user)
    .where(eq(user.businessId, businessId))
    .orderBy(sql`CASE WHEN ${user.role} = 'OWNER' THEN 0 ELSE 1 END`, asc(user.createdAt));
}

export interface PendingInviteRow {
  id: string;
  username: string;
  name: string;
  expiresAt: Date;
  createdAt: Date;
}

export async function listPendingInvites(businessId: string): Promise<PendingInviteRow[]> {
  return db
    .select({
      id: staffInvitation.id,
      username: staffInvitation.username,
      name: staffInvitation.name,
      expiresAt: staffInvitation.expiresAt,
      createdAt: staffInvitation.createdAt
    })
    .from(staffInvitation)
    .where(and(eq(staffInvitation.businessId, businessId), isNull(staffInvitation.acceptedAt), isNull(staffInvitation.revokedAt)))
    .orderBy(desc(staffInvitation.createdAt));
}

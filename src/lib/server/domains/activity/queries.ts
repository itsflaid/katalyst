import { db } from '$lib/server/db';
import { activityLog, user } from '$lib/server/db/schema';
import type { ActivityAction, RoleFilter } from '$lib/shared/activity';
import { and, asc, desc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm';

export interface ActivityRow {
  id: string;
  createdAt: Date;
  actorId: string | null;
  actorName: string;
  actorRole: 'OWNER' | 'STAFF';
  action: ActivityAction;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  userAgent: string | null;
  meta: unknown;
}

export interface ActivityFilter {
  role: RoleFilter;
  actorId: string | null;
  actions: readonly ActivityAction[] | null;
  from: Date | null;
  to: Date | null;
  page: number;
  pageSize: number;
}

// Filter peran memakai kolom snapshot di baris log agar staff terhapus tetap ikut.
export async function listActivity(businessId: string, f: ActivityFilter): Promise<{ rows: ActivityRow[]; hasMore: boolean }> {
  const conds: SQL[] = [eq(activityLog.businessId, businessId)];
  if (f.role === 'owner') conds.push(eq(activityLog.actorRole, 'OWNER'));
  else if (f.role === 'staff') conds.push(eq(activityLog.actorRole, 'STAFF'));
  if (f.actorId) conds.push(eq(activityLog.actorId, f.actorId));
  if (f.actions && f.actions.length > 0) conds.push(inArray(activityLog.action, [...f.actions]));
  if (f.from) conds.push(gte(activityLog.createdAt, f.from));
  if (f.to) conds.push(lt(activityLog.createdAt, f.to));
  const page = Math.max(1, f.page || 1);
  const size = Math.max(1, f.pageSize || 30);
  const rows = await db
    .select({
      id: activityLog.id,
      createdAt: activityLog.createdAt,
      actorId: activityLog.actorId,
      actorName: activityLog.actorName,
      actorRole: activityLog.actorRole,
      action: activityLog.action,
      entityType: activityLog.entityType,
      entityId: activityLog.entityId,
      ip: activityLog.ip,
      userAgent: activityLog.userAgent,
      meta: activityLog.meta
    })
    .from(activityLog)
    .where(and(...conds))
    .orderBy(desc(activityLog.createdAt))
    .limit(size + 1)
    .offset((page - 1) * size);
  return {
    rows: rows.slice(0, size) as ActivityRow[],
    hasMore: rows.length > size
  };
}

// Opsi orang mengikuti peran yang dipilih; validasi memakai daftar penuh.
export async function listActivityUsers(businessId: string) {
  return db
    .select({ id: user.id, name: user.name, username: user.username, role: user.role })
    .from(user)
    .where(eq(user.businessId, businessId))
    .orderBy(sql`CASE WHEN ${user.role} = 'OWNER' THEN 0 ELSE 1 END`, asc(user.createdAt));
}

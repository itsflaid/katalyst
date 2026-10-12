import { activityLog } from '$lib/server/db/schema';
import { isActivityAction, type ActivityAction } from '$lib/shared/activity';

export interface ActivityInput {
  businessId: string;
  actor: { id: string | null; name: string; role: 'OWNER' | 'STAFF' };
  action: ActivityAction;
  entityType?: string;
  entityId?: string;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
  createdAt?: Date;
}

// Baris siap insert; dipakai langsung di db.batch agar log ikut atomik dengan transaksinya.
export function activityRow(input: ActivityInput): typeof activityLog.$inferInsert {
  if (!isActivityAction(input.action)) throw new Error(`Aksi log tidak dikenal: ${String(input.action)}`);
  return {
    id: crypto.randomUUID(),
    businessId: input.businessId,
    actorId: input.actor.id,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    ip: input.ip ?? undefined,
    userAgent: input.userAgent ?? undefined,
    meta: input.meta ?? undefined,
    ...(input.createdAt ? { createdAt: input.createdAt } : {})
  };
}

import { and, eq, gte, sql } from 'drizzle-orm';
import { copilotConversation, copilotMessage } from '../../db/schema';
import type { Db } from '../facts/queries';

export const DEFAULT_DAILY_LIMIT = 40;
const DAY_MS = 24 * 3600_000;

export function dailyLimitFrom(envValue: string | undefined): number {
  const parsed = Number(envValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_LIMIT;
}

// Pertanyaan user 24 jam terakhir; permintaan yang ditolak tidak ikut dihitung.
export async function countRecentUserMessages(db: Db, businessId: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - DAY_MS);
  const rows = await db
    .select({ count: sql<string>`count(*)::text` })
    .from(copilotMessage)
    .innerJoin(copilotConversation, eq(copilotMessage.conversationId, copilotConversation.id))
    .where(
      and(
        eq(copilotConversation.businessId, businessId),
        eq(copilotMessage.role, 'user'),
        gte(copilotMessage.createdAt, since)
      )
    );
  return Number(rows[0]?.count ?? 0);
}

export async function canUseCopilot(
  db: Db,
  businessId: string,
  limit: number,
  now: Date
): Promise<{ ok: boolean; used: number; limit: number }> {
  const used = await countRecentUserMessages(db, businessId, now);
  return used < limit ? { ok: true, used, limit } : { ok: false, used, limit };
}

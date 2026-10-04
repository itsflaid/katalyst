import { and, asc, desc, eq } from 'drizzle-orm';
import { copilotConversation, copilotMessage } from '../../db/schema';
import type { Db } from '../facts/queries';
import { sanitizeText } from './sanitize';

export type HistoryRole = 'user' | 'assistant' | 'tool' | 'notice';

const ROLES: HistoryRole[] = ['user', 'assistant', 'tool', 'notice'];
const MAX_CONTENT = 8000;
const TITLE_MAX = 80;

export interface ConversationRow {
  id: string;
  title: string;
  updatedAt: Date;
}

export interface MessageRow {
  id: string;
  role: HistoryRole;
  content: string;
  toolName: string | null;
  toolResult: unknown;
  createdAt: Date;
}

function toMessageRow(r: typeof copilotMessage.$inferSelect): MessageRow {
  if (!ROLES.includes(r.role as HistoryRole)) throw new Error('INVALID_ROLE');
  return { id: r.id, role: r.role as HistoryRole, content: r.content, toolName: r.toolName, toolResult: r.toolResult, createdAt: r.createdAt };
}

// Judul dari pesan user pertama; selalu disanitasi karena tampil di sidebar.
export function titleFrom(text: string): string {
  return sanitizeText(text, TITLE_MAX);
}

export async function listConversations(db: Db, businessId: string, limit = 20): Promise<ConversationRow[]> {
  const rows = await db
    .select({ id: copilotConversation.id, title: copilotConversation.title, updatedAt: copilotConversation.updatedAt })
    .from(copilotConversation)
    .where(eq(copilotConversation.businessId, businessId))
    .orderBy(desc(copilotConversation.updatedAt))
    .limit(limit);
  return rows;
}

export async function createConversation(db: Db, businessId: string, id: string): Promise<ConversationRow> {
  await db.insert(copilotConversation).values({ id, businessId, title: 'Percakapan baru' });
  const rows = await db
    .select({ id: copilotConversation.id, title: copilotConversation.title, updatedAt: copilotConversation.updatedAt })
    .from(copilotConversation)
    .where(eq(copilotConversation.id, id))
    .limit(1);
  return rows[0];
}

async function ownedConversationId(db: Db, businessId: string, conversationId: string): Promise<boolean> {
  const rows = await db
    .select({ id: copilotConversation.id })
    .from(copilotConversation)
    .where(and(eq(copilotConversation.id, conversationId), eq(copilotConversation.businessId, businessId)))
    .limit(1);
  return rows.length > 0;
}

export async function hasConversation(db: Db, businessId: string, conversationId: string): Promise<boolean> {
  return ownedConversationId(db, businessId, conversationId);
}

export async function getConversation(
  db: Db,
  businessId: string,
  conversationId: string
): Promise<{ conversation: ConversationRow; messages: MessageRow[] } | null> {
  const convRows = await db
    .select({ id: copilotConversation.id, title: copilotConversation.title, updatedAt: copilotConversation.updatedAt })
    .from(copilotConversation)
    .where(and(eq(copilotConversation.id, conversationId), eq(copilotConversation.businessId, businessId)))
    .limit(1);
  if (convRows.length === 0) return null;
  const msgRows = await db
    .select()
    .from(copilotMessage)
    .where(eq(copilotMessage.conversationId, conversationId))
    .orderBy(asc(copilotMessage.createdAt), asc(copilotMessage.id));
  return { conversation: convRows[0], messages: msgRows.map(toMessageRow) };
}

export async function addMessage(
  db: Db,
  businessId: string,
  conversationId: string,
  msg: { id: string; role: HistoryRole; content: string; toolName?: string | null; toolResult?: unknown }
): Promise<boolean> {
  if (!ROLES.includes(msg.role)) throw new Error('INVALID_ROLE');
  if (!(await ownedConversationId(db, businessId, conversationId))) return false;
  await db.insert(copilotMessage).values({
    id: msg.id,
    conversationId,
    role: msg.role,
    content: msg.content.slice(0, MAX_CONTENT),
    toolName: msg.toolName ?? null,
    toolResult: (msg.toolResult ?? null) as Record<string, unknown> | null
  });
  await db
    .update(copilotConversation)
    .set({ updatedAt: new Date() })
    .where(eq(copilotConversation.id, conversationId));
  return true;
}

export async function renameFromFirstMessage(db: Db, businessId: string, conversationId: string, text: string): Promise<void> {
  if (!(await ownedConversationId(db, businessId, conversationId))) return;
  await db
    .update(copilotConversation)
    .set({ title: titleFrom(text), updatedAt: new Date() })
    .where(eq(copilotConversation.id, conversationId));
}

export async function deleteConversation(db: Db, businessId: string, conversationId: string): Promise<boolean> {
  if (!(await ownedConversationId(db, businessId, conversationId))) return false;
  await db.delete(copilotConversation).where(eq(copilotConversation.id, conversationId));
  return true;
}

export async function deleteAllConversations(db: Db, businessId: string): Promise<number> {
  const rows = await db
    .select({ id: copilotConversation.id })
    .from(copilotConversation)
    .where(eq(copilotConversation.businessId, businessId));
  if (rows.length === 0) return 0;
  await db.delete(copilotConversation).where(eq(copilotConversation.businessId, businessId));
  return rows.length;
}

// Enam pesan teks terakhir untuk konteks LLM, urut kronologis; tool/notice tidak ikut.
export async function recentTextContext(
  db: Db,
  businessId: string,
  conversationId: string,
  limit = 6
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  if (!(await ownedConversationId(db, businessId, conversationId))) return [];
  const rows = await db
    .select({ role: copilotMessage.role, content: copilotMessage.content, createdAt: copilotMessage.createdAt, id: copilotMessage.id })
    .from(copilotMessage)
    .where(eq(copilotMessage.conversationId, conversationId))
    .orderBy(desc(copilotMessage.createdAt), desc(copilotMessage.id))
    .limit(60);
  const picked: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const r of rows) {
    if (r.role !== 'user' && r.role !== 'assistant') continue;
    picked.push({ role: r.role, content: r.content });
    if (picked.length >= limit) break;
  }
  return picked.reverse();
}

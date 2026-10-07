import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
import * as schema from '../src/lib/server/db/schema';
import { business, copilotConversation, copilotMessage } from '../src/lib/server/db/schema';
import { canUseCopilot, countRecentUserMessages, dailyLimitFrom } from '../src/lib/server/domains/copilot/limits';

let passCount = 0;
let failCount = 0;
function ok(label: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  \x1b[32mPASS\x1b[0m  ${label}`);
    passCount++;
  } else {
    console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? `: ${detail}` : ''}`);
    failCount++;
  }
}

async function main() {
  ok('limit tak valid memakai 40', dailyLimitFrom(undefined) === 40 && dailyLimitFrom('asal') === 40 && dailyLimitFrom('0') === 40 && dailyLimitFrom('-5') === 40 && dailyLimitFrom('25') === 25);
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum di-set.');
  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client, { schema });
  const ROLLBACK = new Error('__rollback_fixture__');
  try {
    await db.transaction(async (tx) => {
      const now = new Date('2026-10-07T00:00:00Z');
      const biz = randomUUID();
      const other = randomUUID();
      await tx.insert(business).values([{ id: biz, name: 'Batas' }, { id: other, name: 'Lain' }]);
      const conv = randomUUID();
      await tx.insert(copilotConversation).values({ id: conv, businessId: biz, title: 'Uji' });
      const minute = 60_000;
      await tx.insert(copilotMessage).values([
        { id: randomUUID(), conversationId: conv, role: 'user', content: 'dalam', createdAt: new Date(now.getTime() - (24 * 60 - 1) * minute) },
        { id: randomUUID(), conversationId: conv, role: 'user', content: 'luar', createdAt: new Date(now.getTime() - (24 * 60 + 1) * minute) },
        { id: randomUUID(), conversationId: conv, role: 'assistant', content: 'balasan', createdAt: new Date(now.getTime() - 60 * minute) }
      ]);
      const second = randomUUID();
      await tx.insert(copilotConversation).values({ id: second, businessId: biz, title: 'Kedua' });
      await tx.insert(copilotMessage).values(
        Array.from({ length: 38 }, (_, i) => ({
          id: randomUUID(),
          conversationId: second,
          role: 'user',
          content: `tanya ${i}`,
          createdAt: new Date(now.getTime() - (i + 1) * minute)
        }))
      );
      const foreign = randomUUID();
      await tx.insert(copilotConversation).values({ id: foreign, businessId: other, title: 'Asing' });
      await tx.insert(copilotMessage).values(
        Array.from({ length: 100 }, (_, i) => ({
          id: randomUUID(),
          conversationId: foreign,
          role: 'user',
          content: `asing ${i}`,
          createdAt: new Date(now.getTime() - (i + 1) * minute)
        }))
      );
      const used = await countRecentUserMessages(tx, biz, now);
      ok('batas 24 jam dan peran disaring', used === 39, `used=${used}`);
      ok('di bawah batas boleh', (await canUseCopilot(tx, biz, 40, now)).ok);
      ok('tepat di batas ditolak', !(await canUseCopilot(tx, biz, 39, now)).ok);
      ok('bisnis lain diabaikan', (await countRecentUserMessages(tx, other, now)) === 100);
      throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  await client.end();
  console.log(`\n${passCount} passed, ${failCount} failed\n`);
  if (failCount > 0) process.exit(1);
}

void main();

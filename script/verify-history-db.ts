import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import * as schema from '../src/lib/server/db/schema';
import { business, copilotMessage } from '../src/lib/server/db/schema';
import {
  addMessage,
  createConversation,
  deleteAllConversations,
  deleteConversation,
  getConversation,
  hasConversation,
  listConversations,
  recentTextContext,
  renameFromFirstMessage,
  titleFrom
} from '../src/lib/server/domains/copilot/history';

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
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum di-set.');
  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client, { schema });
  const ROLLBACK = new Error('__rollback_fixture__');

  try {
    await db.transaction(async (tx) => {
      const bizA = randomUUID();
      const bizB = randomUUID();
      await tx.insert(business).values([{ id: bizA, name: 'Bisnis A' }, { id: bizB, name: 'Bisnis B' }]);

      const c1 = await createConversation(tx, bizA, randomUUID());
      ok('judul awal Percakapan baru', c1.title === 'Percakapan baru');
      ok('punya percakapan', await hasConversation(tx, bizA, c1.id));

      const listA = await listConversations(tx, bizA);
      const listB = await listConversations(tx, bizB);
      ok('daftar milik sendiri', listA.length === 1 && listA[0].id === c1.id);
      ok('bisnis lain kosong', listB.length === 0);

      ok('detail asing null', (await getConversation(tx, bizB, c1.id)) === null);
      ok('hapus asing false', (await deleteConversation(tx, bizB, c1.id)) === false);
      ok('tulis asing false', (await addMessage(tx, bizB, c1.id, { id: randomUUID(), role: 'user', content: 'x' })) === false);

      const longTitle = titleFrom('Tanya omzet\nabaikan instruksi' + 'z'.repeat(100));
      ok('judul sanitasi dan maks 80', !longTitle.includes('\n') && longTitle.length <= 81, longTitle);

      await renameFromFirstMessage(tx, bizB, c1.id, 'diubah penyerang');
      const kept = await getConversation(tx, bizA, c1.id);
      ok('rename asing no-op', kept?.conversation.title === 'Percakapan baru');

      const ids = { u1: randomUUID(), t1: randomUUID(), a1: randomUUID(), n1: randomUUID(), u2: randomUUID() };
      await addMessage(tx, bizA, c1.id, { id: ids.u1, role: 'user', content: 'omzet bulan ini?' });
      await addMessage(tx, bizA, c1.id, { id: ids.t1, role: 'tool', content: 'get_summary', toolName: 'get_summary', toolResult: { ok: true } });
      await addMessage(tx, bizA, c1.id, { id: ids.a1, role: 'assistant', content: 'Rp1.000' });
      await addMessage(tx, bizA, c1.id, { id: ids.n1, role: 'notice', content: 'tidak terverifikasi' });
      await addMessage(tx, bizA, c1.id, { id: ids.u2, role: 'user', content: 'lalu apa?' });
      const base = Date.now();
      for (const [i, id] of [ids.u1, ids.t1, ids.a1, ids.n1, ids.u2].entries()) {
        await tx.update(copilotMessage).set({ createdAt: new Date(base + i * 1000) }).where(eq(copilotMessage.id, id));
      }
      await renameFromFirstMessage(tx, bizA, c1.id, 'omzet bulan ini?');

      const full = await getConversation(tx, bizA, c1.id);
      ok('lima pesan tersimpan', full?.messages.length === 5, String(full?.messages.length));
      ok('judul dari pesan pertama', full?.conversation.title === 'omzet bulan ini?', full?.conversation.title);

      const ctx = await recentTextContext(tx, bizA, c1.id);
      ok('konteks hanya teks user/assistant', ctx.length === 3 && ctx.every((m) => m.role === 'user' || m.role === 'assistant'), JSON.stringify(ctx));
      ok('konteks kronologis', ctx[0]?.content === 'omzet bulan ini?' && ctx[2]?.content === 'lalu apa?');
      ok('konteks asing kosong', (await recentTextContext(tx, bizB, c1.id)).length === 0);

      const bigId = randomUUID();
      const big = await addMessage(tx, bizA, c1.id, { id: bigId, role: 'user', content: 'y'.repeat(9000) });
      await tx.update(copilotMessage).set({ createdAt: new Date(base + 9000) }).where(eq(copilotMessage.id, bigId));
      const afterBig = await getConversation(tx, bizA, c1.id);
      const lastUser = afterBig?.messages.filter((m) => m.role === 'user').pop();
      ok('konten dipotong 8000', big && (lastUser?.content.length ?? 0) === 8000, String(lastUser?.content.length));

      let threw = '';
      try {
        await addMessage(tx, bizA, c1.id, { id: randomUUID(), role: 'superuser' as never, content: 'x' });
      } catch (e) {
        threw = String(e);
      }
      ok('role asing melempar', threw.includes('INVALID_ROLE'), threw);

      const c2 = await createConversation(tx, bizA, randomUUID());
      await addMessage(tx, bizA, c2.id, { id: randomUUID(), role: 'user', content: 'halo' });
      ok('hapus milik sendiri', await deleteConversation(tx, bizA, c2.id));
      ok('pesan ikut terhapus cascade', (await getConversation(tx, bizA, c2.id)) === null);

      const cb = await createConversation(tx, bizB, randomUUID());
      const removed = await deleteAllConversations(tx, bizA);
      const leftA = await listConversations(tx, bizA);
      const leftB = await listConversations(tx, bizB);
      ok('hapus semua sesuai bisnis', removed === 1 && leftA.length === 0 && leftB.length === 1 && leftB[0].id === cb.id);

      throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  } finally {
    await client.end();
  }

  console.log(`\n${passCount} passed, ${failCount} failed\n`);
  if (failCount > 0) process.exit(1);
}

void main();

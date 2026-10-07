import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { createLlmClient } from '$lib/server/domains/copilot/llm/index';
import { LlmHttpError, type LlmMessage } from '$lib/server/domains/copilot/llm/types';
import { SubrequestBudget } from '$lib/server/domains/copilot/budget';
import { TOOL_REGISTRY, findTool } from '$lib/server/domains/copilot/registry';
import type { ToolContext } from '$lib/server/domains/copilot/context';
import { failure } from '$lib/server/domains/copilot/envelope';
import { toModelView } from '$lib/server/domains/copilot/model-view';
import { verifyGrounding } from '$lib/server/domains/copilot/grounding';
import { canUseCopilot, dailyLimitFrom } from '$lib/server/domains/copilot/limits';
import { copilotPrompt } from '$lib/server/domains/copilot/prompt';
import {
  addMessage,
  createConversation,
  hasConversation,
  recentTextContext,
  renameFromFirstMessage
} from '$lib/server/domains/copilot/history';
import { countedDb } from '$lib/server/domains/copilot/db';
import type { Db } from '$lib/server/domains/facts/queries';
import { makeTime, type BizTz } from '$lib/shared/time';

const MAX_MESSAGES = 6;
const MAX_CONTENT = 800;
const MAX_STEPS = 5;
const MAX_TOOL_CALLS = 6;

function parseMessages(body: unknown): { ok: true; messages: LlmMessage[] } | { ok: false; message: string } {
  const invalid = 'Isi pesan maksimal 6, tiap pesan maksimal 800 karakter, pesan terakhir harus dari pengguna.';
  const list = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_MESSAGES) return { ok: false, message: invalid };
  const out: LlmMessage[] = [];
  for (const item of list) {
    const m = item as { role?: unknown; content?: unknown };
    if ((m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || m.content.length > MAX_CONTENT) {
      return { ok: false, message: invalid };
    }
    out.push({ role: m.role, content: m.content });
  }
  if (out[out.length - 1].role !== 'user') return { ok: false, message: invalid };
  return { ok: true, messages: out };
}

// Simpan pesan user lalu ambil konteks teks dari server; null bila percakapan asing.
async function loadHistory(
  db: Db,
  businessId: string,
  asked: string | undefined,
  incoming: LlmMessage[]
): Promise<{ conversationId: string; history: LlmMessage[] } | null> {
  let conversationId = asked;
  if (conversationId && !(await hasConversation(db, businessId, conversationId))) return null;
  if (!conversationId) {
    conversationId = globalThis.crypto.randomUUID();
    await createConversation(db, businessId, conversationId);
  }
  const fresh = incoming.filter((m) => m.role === 'user');
  for (const m of fresh) {
    await addMessage(db, businessId, conversationId, { id: globalThis.crypto.randomUUID(), role: 'user', content: m.content });
  }
  const stored = await recentTextContext(db, businessId, conversationId);
  if (stored.filter((m) => m.role === 'user').length <= fresh.length && fresh[0]) {
    await renameFromFirstMessage(db, businessId, conversationId, fresh[0].content);
  }
  return { conversationId, history: stored };
}

export const POST: RequestHandler = async ({ request, url, locals }) => {
  if (!locals.user) return Response.json({ error: 'Belum masuk. Silakan login dulu.' }, { status: 401 });
  if ((locals.user as { role?: unknown }).role !== 'OWNER') {
    return Response.json({ error: 'Hanya owner yang boleh memakai Copilot.' }, { status: 403 });
  }
  if (!locals.business) return Response.json({ error: 'Bisnis tidak ditemukan.' }, { status: 403 });
  const origin = request.headers.get('origin');
  if (!origin || origin !== url.origin) return Response.json({ error: 'Origin tidak diizinkan.' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body harus JSON.' }, { status: 400 });
  }
  const parsed = parseMessages(body);
  if (!parsed.ok) return Response.json({ error: parsed.message }, { status: 400 });
  const rawConv = (body as { conversationId?: unknown })?.conversationId;
  const askedConv = typeof rawConv === 'string' && rawConv ? rawConv : undefined;

  const apiKey = env.LLM_API_KEY ?? '';
  if (!apiKey) return Response.json({ error: 'LLM belum dikonfigurasi.' }, { status: 503 });
  const models = (env.LLM_MODELS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  const business = locals.business;
  const tz = business.timezone;
  const now = new Date();
  const startMs = Date.now();
  const budget = new SubrequestBudget();
  const requestDb = countedDb(env.DATABASE_URL ?? '', budget);
  const ctx: ToolContext = { businessId: business.id, tz, now, db: requestDb, budget };
  const limit = dailyLimitFrom(env.COPILOT_DAILY_LIMIT);
  if (!(await canUseCopilot(requestDb, business.id, limit, now)).ok) {
    return Response.json(
      { code: 'DAILY_LIMIT', error: `Batas ${limit} pertanyaan per 24 jam tercapai. Coba lagi nanti.` },
      { status: 429 }
    );
  }
  const tools = TOOL_REGISTRY.filter((tool) => tool.enabled);
  const client = createLlmClient(
    {
      provider: env.LLM_PROVIDER || 'groq',
      apiKey,
      models: models.length > 0 ? models : undefined,
      baseUrl: env.LLM_BASE_URL || undefined,
      maxFailover: Number(env.COPILOT_MAX_FAILOVER) || 2,
      onAttempt: () => budget.spend(1)
    }
  );
  const loaded = await loadHistory(requestDb, business.id, askedConv, parsed.messages);
  if (!loaded) return Response.json({ error: 'Percakapan tidak ditemukan.' }, { status: 404 });
  const history: LlmMessage[] = loaded.history;
  const T = makeTime(tz);
  const system = copilotPrompt({ businessName: business.name, dateLabel: T.fmt(now, { day: 'numeric', month: 'short', year: 'numeric' }), tz });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      let steps = 0;
      const convId = loaded.conversationId;
      const saveFailure = { code: 'SAVE_FAILED', message: 'Gagal menyimpan riwayat, jawaban tetap ditampilkan.' };
      try {
        send('conversation', { id: convId });
        let inputTokens = 0;
        let outputTokens = 0;
        let model = '';
        let failovers = 0;
        const called: string[] = [];
        const toolResults: unknown[] = [];
        const toolCache = new Map<string, unknown>();
        let finalText: string | null = null;
        let grounding: 'ok' | 'retried' | 'failed' = 'ok';
        for (let step = 0; step < MAX_STEPS && finalText === null; step++) {
          let textBuf = '';
          const pending: { id: string; name: string; argsJson: string }[] = [];
          steps++;
          for await (const ev of client.stream(
            { system, messages: history, tools: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })), toolChoice: step === MAX_STEPS - 1 ? 'none' : 'auto', maxTokens: 600, temperature: 0 },
            request.signal
          )) {
            if (ev.type === 'model') {
              model = ev.model;
              failovers = ev.failovers;
            } else if (ev.type === 'usage') {
              inputTokens += ev.inputTokens;
              outputTokens += ev.outputTokens;
            } else if (ev.type === 'text') {
              textBuf += ev.delta;
            } else if (ev.type === 'tool_call') {
              pending.push(ev);
            }
          }
          if (pending.length === 0) {
            finalText = textBuf;
            break;
          }
          history.push({
            role: 'assistant',
            content: textBuf,
            toolCalls: pending.map((c) => ({ id: c.id, name: c.name, argsJson: c.argsJson }))
          });
          for (const call of pending) {
            const tool = findTool(call.name);
            let args: unknown = call.argsJson;
            try {
              args = JSON.parse(call.argsJson);
            } catch {
              args = call.argsJson;
            }
            send('tool_start', { id: call.id, name: call.name, args });
            called.push(call.name);
            const cacheKey = `${call.name}:${JSON.stringify(args)}`;
            const result = toolCache.get(cacheKey) ?? (!tool
              ? failure(call.name, 'INVALID_ARGS', `Tool tak dikenal: ${call.name}`)
              : called.length > MAX_TOOL_CALLS
                ? failure(call.name, 'BUDGET_EXCEEDED', 'Terlalu banyak tool dipanggil, persempit pertanyaan.')
              : !budget.canAfford(tool.maxQueries)
                ? failure(call.name, 'BUDGET_EXCEEDED', 'Anggaran komputasi habis, persempit pertanyaan.')
                : await tool.run(ctx, args));
            toolCache.set(cacheKey, result);
            toolResults.push(result);
            send('tool_result', { id: call.id, name: call.name, result });
            try {
              await addMessage(requestDb, business.id, convId, {
                id: globalThis.crypto.randomUUID(),
                role: 'tool',
                content: call.name,
                toolName: call.name,
                toolResult: result as Record<string, unknown>
              });
            } catch (saveError) {
              console.error(JSON.stringify({ save: 'tool', error: String(saveError) }));
              send('error', saveFailure);
            }
            history.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(toModelView(result)) });
          }
        }
        if (finalText) {
          const checked = verifyGrounding(finalText, toolResults);
          if (!checked.ok) {
            grounding = 'retried';
            let retryText = '';
            for await (const ev of client.stream(
              { system: `${system} Jawaban sebelumnya ditolak karena memuat angka yang tidak ada di hasil tool. Jawab ulang tanpa tool dan hanya gunakan angka dari hasil tool.`, messages: history, tools: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })), toolChoice: 'none', maxTokens: 600, temperature: 0 },
              request.signal
            )) {
              if (ev.type === 'model') { model = ev.model; failovers = ev.failovers; }
              else if (ev.type === 'usage') { inputTokens += ev.inputTokens; outputTokens += ev.outputTokens; }
              else if (ev.type === 'text') retryText += ev.delta;
            }
            if (retryText && verifyGrounding(retryText, toolResults).ok) finalText = retryText;
            else { finalText = null; grounding = 'failed'; }
          }
        }
        const donePayload = {
          usage: { inputTokens, outputTokens },
          toolCalls: called,
          budgetUsed: budget.used,
          model,
          failovers,
          grounding
        };
        if (finalText === null || finalText === '') {
          console.log(JSON.stringify({ budgetUsed: budget.used, steps, wallMs: Date.now() - startMs }));
          if (grounding === 'failed') {
            const notice = 'Jawaban memuat angka yang tidak dapat diverifikasi; lihat hasil tool di atas.';
            try {
              await addMessage(requestDb, business.id, convId, { id: globalThis.crypto.randomUUID(), role: 'notice', content: notice });
            } catch (saveError) {
              console.error(JSON.stringify({ save: 'notice', error: String(saveError) }));
            }
            send('notice', { code: 'UNVERIFIED', message: notice });
            send('done', donePayload);
          } else send('error', { code: 'PROVIDER', message: 'Belum ada jawaban final, coba lagi sebentar.' });
        } else {
          try {
            await addMessage(requestDb, business.id, convId, { id: globalThis.crypto.randomUUID(), role: 'assistant', content: finalText });
          } catch (saveError) {
            console.error(JSON.stringify({ save: 'assistant', error: String(saveError) }));
            send('error', saveFailure);
          }
          send('text', { text: finalText });
          send('done', donePayload);
          console.log(JSON.stringify({ budgetUsed: budget.used, steps, wallMs: Date.now() - startMs }));
        }
      } catch (e) {
        if ((e as Error)?.name === 'AbortError' || request.signal.aborted) return;
        console.log(JSON.stringify({ budgetUsed: budget.used, steps, wallMs: Date.now() - startMs }));
        const code = e instanceof LlmHttpError && e.status === 429 ? 'RATE_LIMITED' : 'PROVIDER';
        const message =
          code === 'RATE_LIMITED'
            ? 'Lagi ramai, coba lagi sebentar.'
            : e instanceof Error && e.message === 'BUDGET_EXCEEDED'
              ? 'Anggaran komputasi habis, persempit pertanyaan.'
              : 'Penyedia AI bermasalah, coba lagi sebentar.';
        send('error', { code, message });
      } finally {
        controller.close();
      }
    }
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' }
  });
};

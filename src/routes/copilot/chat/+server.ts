import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { createLlmClient } from '$lib/server/domains/copilot/llm/index';
import { LlmHttpError, type LlmMessage } from '$lib/server/domains/copilot/llm/types';
import { SubrequestBudget } from '$lib/server/domains/copilot/budget';
import { queryFactsByDay, type Db } from '$lib/server/domains/facts/queries';
import { metricsOf, sumFacts } from '$lib/analytics/facts';
import { resolvePeriod } from '$lib/shared/period';
import { makeTime, type BizTz } from '$lib/shared/time';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';

const MAX_MESSAGES = 12;
const MAX_CONTENT = 2000;
const MAX_STEPS = 3;

function fmtRp(n: number): string {
  const digits = Math.abs(Math.round(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-Rp' : 'Rp') + digits;
}

function fmtPct(x: number): string {
  return `${(Math.round(x * 1000) / 10).toFixed(1).replace('.', ',')}%`;
}

interface ToolCtx {
  businessId: string;
  tz: BizTz;
  now: Date;
  db: Db;
  budget: SubrequestBudget;
}

// Tiap query HTTP dihitung: drizzle memakai `.query`, bukan pemanggilan langsung.
function countedDb(url: string, budget: SubrequestBudget): Db {
  const query = neon(url);
  const base = query as unknown as (...args: never[]) => Promise<unknown>;
  const baseQuery = query.query as unknown as (...args: never[]) => Promise<unknown>;
  const wrapped = (async (...args: never[]) => {
    budget.spend(1);
    return base(...args);
  }) as unknown as typeof query;
  (wrapped as unknown as { query: unknown }).query = async (...args: never[]) => {
    budget.spend(1);
    return baseQuery(...args);
  };
  return drizzle(wrapped, { schema });
}

// TODO(T1.7: ganti dengan TL-1 dan format dari shared/format): tool sementara
async function runGetSummary(ctx: ToolCtx): Promise<Record<string, unknown>> {
  const period = resolvePeriod(new URL('http://internal/?range=30d'), ctx.tz, ctx.now, { default: '30d', allow: [] });
  const from = period.from as Date;
  const to = period.to as Date;
  const rows = await queryFactsByDay(ctx.db, ctx.businessId, { from, to }, ctx.tz);
  const list = [...rows.values()];
  const m = metricsOf(sumFacts(list));
  const txCount = list.reduce((s, r) => s + r.txCount, 0);
  return {
    revenue: m.revenue,
    revenueText: fmtRp(m.revenue),
    cost: m.cost,
    costText: fmtRp(m.cost),
    profit: m.profit,
    profitText: fmtRp(m.profit),
    margin: m.margin,
    marginText: fmtPct(m.margin),
    txCount,
    window: period.label
  };
}

interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (ctx: ToolCtx, args: unknown) => Promise<Record<string, unknown>>;
}

const TOOLS: ToolDef[] = [
  {
    name: 'get_summary',
    description: 'Ringkasan bisnis 30 hari terakhir: omzet, modal, profit, margin, jumlah struk. Pakai untuk pertanyaan omzet atau untung.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: (ctx: ToolCtx) => runGetSummary(ctx)
  },
  {
    name: '__measure',
    description: 'Alat ukur internal: menjalankan N query ringan paralel.',
    parameters: { type: 'object', properties: { queries: { type: 'integer', enum: [2, 5, 8] } }, required: ['queries'], additionalProperties: false },
    // TODO(T1.7: hapus saat TL-1 asli masuk): alat ukur T0.4
    run: async (ctx: ToolCtx, args: unknown) => {
      const n = (args as { queries?: unknown })?.queries;
      if (n !== 2 && n !== 5 && n !== 8) return { error: 'Argumen queries harus 2, 5, atau 8.' };
      const start = Date.now();
      await Promise.all(Array.from({ length: n }, () => ctx.db.execute(sql`select 1`)));
      return { queries: n, budgetUsed: ctx.budget.used, wallMs: Date.now() - start };
    }
  }
];

function parseMessages(body: unknown): { ok: true; messages: LlmMessage[] } | { ok: false; message: string } {
  const invalid = 'Isi pesan maksimal 12, tiap pesan maksimal 2000 karakter, pesan terakhir harus dari pengguna.';
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

  const apiKey = env.LLM_API_KEY ?? '';
  if (!apiKey) return Response.json({ error: 'LLM belum dikonfigurasi.' }, { status: 503 });
  const models = (env.LLM_MODELS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  const business = locals.business;
  const tz = business.timezone;
  const now = new Date();
  const startMs = Date.now();
  const budget = new SubrequestBudget();
  const requestDb = countedDb(env.DATABASE_URL ?? '', budget);
  const ctx: ToolCtx = { businessId: business.id, tz, now, db: requestDb, budget };
  const tools = env.COPILOT_MEASURE === '1' ? TOOLS : TOOLS.filter((t) => t.name !== '__measure');
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
  const history: LlmMessage[] = [...parsed.messages];
  const T = makeTime(tz);
  const system =
    `Kamu Katalyst Copilot untuk ${business.name}. Hari ini ${T.fmt(now, { day: 'numeric', month: 'short', year: 'numeric' })} (${tz}). ` +
    'Jawab singkat bahasa Indonesia. Semua angka WAJIB dari hasil tool get_summary; salin string berformatnya persis tanpa menghitung ulang. Selalu sebut rentang waktunya.';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      let steps = 0;
      try {
        let inputTokens = 0;
        let outputTokens = 0;
        let model = '';
        let failovers = 0;
        const called: string[] = [];
        let finalText: string | null = null;
        for (let step = 0; step < MAX_STEPS && finalText === null; step++) {
          let textBuf = '';
          const pending: { id: string; name: string; argsJson: string }[] = [];
          steps++;
          for await (const ev of client.stream(
            { system, messages: history, tools: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })), toolChoice: 'auto', maxTokens: 600, temperature: 0 },
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
            const tool = tools.find((t) => t.name === call.name);
            let args: unknown = call.argsJson;
            try {
              args = JSON.parse(call.argsJson);
            } catch {
              args = call.argsJson;
            }
            send('tool_start', { id: call.id, name: call.name, args });
            called.push(call.name);
            const result = tool
              ? await tool.run(ctx, args)
              : { error: `Tool tak dikenal: ${call.name}` };
            send('tool_result', { id: call.id, name: call.name, result });
            history.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(result) });
          }
        }
        if (finalText === null || finalText === '') {
          console.log(JSON.stringify({ budgetUsed: budget.used, steps, wallMs: Date.now() - startMs }));
          send('error', { code: 'PROVIDER', message: 'Belum ada jawaban final, coba lagi sebentar.' });
        } else {
          send('text', { text: finalText });
          send('done', {
            usage: { inputTokens, outputTokens },
            toolCalls: called,
            budgetUsed: budget.used,
            model,
            failovers,
            grounding: 'ok'
          });
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

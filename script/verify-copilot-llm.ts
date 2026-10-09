import { createLlmClient } from '../src/lib/server/domains/copilot/llm/index';
import { createOpenAiCompatClient } from '../src/lib/server/domains/copilot/llm/openai-compat';
import { createPooledClient } from '../src/lib/server/domains/copilot/llm/pool';
import {
  LlmHttpError,
  type LlmClient,
  type LlmEvent,
  type LlmRequest
} from '../src/lib/server/domains/copilot/llm/types';

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

function sse(chunks: string[], status = 200, headers: Record<string, string> = {}): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk));
      c.close();
    }
  });
  return new Response(stream, { status, headers });
}

function fakeFetch(chunks: string[], status = 200, headers: Record<string, string> = {}): typeof fetch {
  return (async () => sse(chunks, status, headers)) as typeof fetch;
}

async function collect(client: LlmClient, req: LlmRequest): Promise<LlmEvent[]> {
  const out: LlmEvent[] = [];
  for await (const e of client.stream(req, new AbortController().signal)) out.push(e);
  return out;
}

async function collectFails(client: LlmClient, req: LlmRequest): Promise<unknown> {
  try {
    await collect(client, req);
  } catch (e) {
    return e;
  }
  return null;
}

const baseReq: LlmRequest = {
  system: 'jawab singkat',
  messages: [{ role: 'user', content: 'halo' }],
  tools: [],
  toolChoice: 'auto',
  maxTokens: 600,
  temperature: 0
};

const chunk = (delta: unknown, finish: string | null = null, usage?: unknown) =>
  `data: ${JSON.stringify({ choices: [{ delta, index: 0, ...(finish ? { finish_reason: finish } : {}) }], ...(usage ? { usage } : {}) })}\n\n`;
const DONE = 'data: [DONE]\n\n';

function splitMid(s: string, at: number): [string, string] {
  return [s.slice(0, at), s.slice(at)];
}

function isModelFirst(events: LlmEvent[]): boolean {
  return events.length > 0 && events[0].type === 'model';
}

console.log('\n== kontrak adapter ==');

{
  const [a, b] = splitMid(chunk({ content: 'Halo' }), 40);
  const events = await collect(
    createOpenAiCompatClient({ baseUrl: 'https://x.test', apiKey: 'k', model: 'm1', fetchImpl: fakeFetch([a, b, chunk({}, 'stop'), DONE]) }),
    baseReq
  );
  ok('(1) model pertama', isModelFirst(events), JSON.stringify(events));
  ok('(1) teks + stop', events.some((e) => e.type === 'text' && e.delta === 'Halo') && events.some((e) => e.type === 'finish' && e.reason === 'stop'));
}

{
  const f1 = chunk({ tool_calls: [{ index: 0, id: 'call_1', function: { name: 'get_summary', arguments: '{"per' } }] });
  const f2 = chunk({ tool_calls: [{ index: 0, function: { arguments: 'iod":"last_30d"}' } }] });
  const [a, b] = splitMid(f1 + f2, f1.length - 5);
  const events = await collect(
    createOpenAiCompatClient({ baseUrl: 'https://x.test', apiKey: 'k', model: 'm1', fetchImpl: fakeFetch([a, b, chunk({}, 'tool_calls'), DONE]) }),
    { ...baseReq, tools: [{ name: 'get_summary', description: 'd', parameters: {} }] }
  );
  const call = events.find((e) => e.type === 'tool_call');
  ok('(2) tool utuh walau argumen terpecah', call?.type === 'tool_call' && call.argsJson === '{"period":"last_30d"}', JSON.stringify(events));
}

{
  const events = await collect(
    createOpenAiCompatClient({
      baseUrl: 'https://x.test',
      apiKey: 'k',
      model: 'm1',
      fetchImpl: fakeFetch([
        chunk({ tool_calls: [{ index: 1, id: 'c2', function: { name: 'b', arguments: '{}' } }] }),
        chunk({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'a', arguments: '{}' } }] }),
        chunk({}, 'tool_calls'),
        DONE
      ])
    }),
    baseReq
  );
  const calls = events.filter((e) => e.type === 'tool_call');
  ok('(3) dua tool urut index', calls.length === 2 && calls[0].type === 'tool_call' && calls[0].id === 'c1' && calls[1].type === 'tool_call' && calls[1].id === 'c2', JSON.stringify(events));
}

{
  const events = await collect(
    createOpenAiCompatClient({
      baseUrl: 'https://x.test',
      apiKey: 'k',
      model: 'm1',
      fetchImpl: fakeFetch([chunk({ content: 'ok' }), chunk({}, 'stop', { prompt_tokens: 120, completion_tokens: 30 }), DONE])
    }),
    baseReq
  );
  const use = events.find((e) => e.type === 'usage');
  ok('(4) usage di akhir', use?.type === 'usage' && use.inputTokens === 120 && use.outputTokens === 30, JSON.stringify(events));
}

{
  const events = await collect(
    createOpenAiCompatClient({
      baseUrl: 'https://x.test',
      apiKey: 'k',
      model: 'm1',
      fetchImpl: fakeFetch([chunk({ content: 'Jawaban', reasoning: 'rahasia', reasoning_content: 'sangat rahasia', thought: 'pikir' }), chunk({}, 'stop'), DONE])
    }),
    baseReq
  );
  ok('(5) penalaran diabaikan', !JSON.stringify(events).includes('rahasia') && events.some((e) => e.type === 'text' && e.delta === 'Jawaban'), JSON.stringify(events));
}

{
  const err = await collectFails(
    createOpenAiCompatClient({ baseUrl: 'https://x.test', apiKey: 'k', model: 'm1', fetchImpl: fakeFetch([], 429, { 'retry-after': '2' }) }),
    baseReq
  );
  ok('(6) 429 + Retry-After', err instanceof LlmHttpError && err.status === 429 && err.retryAfterMs === 2000, String(err));
}

{
  const events = await collect(
    createOpenAiCompatClient({
      baseUrl: 'https://x.test',
      apiKey: 'k',
      model: 'm1',
      fetchImpl: fakeFetch([chunk({ tool_calls: [{ index: 0, id: 'c1', function: { name: 't', arguments: '{"period":' } }] }), chunk({}, 'tool_calls'), DONE])
    }),
    baseReq
  );
  const call = events.find((e) => e.type === 'tool_call');
  ok('(7) argumen rusak diteruskan apa adanya', call?.type === 'tool_call' && call.argsJson === '{"period":', JSON.stringify(events));
}

{
  const events = await collect(
    createOpenAiCompatClient({ baseUrl: 'https://x.test', apiKey: 'k', model: 'm1', fetchImpl: fakeFetch([chunk({ content: 'setengah' })]) }),
    baseReq
  );
  ok('(8) stream terputus jadi error', events.some((e) => e.type === 'finish' && e.reason === 'error'), JSON.stringify(events));
}

console.log('\n== kolam failover ==');

function member(model: string, chunks: string[], status = 200, headers: Record<string, string> = {}) {
  return { model, client: createOpenAiCompatClient({ baseUrl: 'https://x.test', apiKey: 'k', model, fetchImpl: fakeFetch(chunks, status, headers) }) };
}
const okChunks = [chunk({ content: 'siap' }), chunk({}, 'stop'), DONE];

{
  const tried: string[] = [];
  const pool = createPooledClient([member('m1', [], 429, { 'retry-after': '1' }), member('m2', okChunks)], {
    maxFailover: 2,
    cooldowns: new Map(),
    onAttempt: (m) => tried.push(m)
  });
  const events = await collect(pool, baseReq);
  const first = events[0];
  ok('(9) pindah saat 429, failovers=1', first?.type === 'model' && first.model === 'm2' && first.failovers === 1 && tried.join(',') === 'm1,m2', JSON.stringify({ events, tried }));
}

{
  const t5xx: string[] = [];
  const pool5xx = createPooledClient([member('m1', [], 500), member('m2', okChunks)], { maxFailover: 2, cooldowns: new Map(), onAttempt: (m) => t5xx.push(m) });
  const e5xx = await collect(pool5xx, baseReq);
  const failingFetch = (() => Promise.reject(new Error('jaringan putus'))) as typeof fetch;
  const poolTimeout = createPooledClient(
    [
      { model: 'm1', client: createOpenAiCompatClient({ baseUrl: 'https://x.test', apiKey: 'k', model: 'm1', fetchImpl: failingFetch }) },
      member('m2', okChunks)
    ],
    { maxFailover: 2, cooldowns: new Map() }
  );
  const eTimeout = await collect(poolTimeout, baseReq);
  ok('(10) 5xx dan timeout memicu pindah', e5xx[0]?.type === 'model' && e5xx[0].model === 'm2' && eTimeout[0]?.type === 'model' && eTimeout[0].model === 'm2' && t5xx.join(',') === 'm1,m2');
}

{
  const tried: string[] = [];
  const failAfterFirst: LlmClient = {
    async *stream() {
      yield { type: 'model', model: 'm1', failovers: 0 };
      yield { type: 'text', delta: 'mulai' };
      throw new Error('putus di tengah');
    }
  };
  const pool = createPooledClient([{ model: 'm1', client: failAfterFirst }, member('m2', okChunks)], { maxFailover: 2, cooldowns: new Map(), onAttempt: (m) => tried.push(m) });
  const err = await collectFails(pool, baseReq);
  ok('(11) gagal setelah event pertama tidak pindah', err instanceof Error && err.message === 'putus di tengah' && tried.join(',') === 'm1', `${String(err)} tried=${tried}`);
}

{
  const tried: string[] = [];
  const pool = createPooledClient([member('m1', [], 500), member('m2', [], 500), member('m3', okChunks)], {
    maxFailover: 1,
    cooldowns: new Map(),
    onAttempt: (m) => tried.push(m)
  });
  await collect(pool, baseReq).catch(() => null);
  ok('(12) tidak melebihi maxFailover', tried.length === 2, tried.join(','));
}

{
  const pool = createPooledClient([member('m1', [], 429), member('m2', [], 429)], { maxFailover: 2, cooldowns: new Map() });
  const err = await collectFails(pool, baseReq);
  ok('(13) semua 429 jadi 429', err instanceof LlmHttpError && err.status === 429, String(err));
}

{
  let nowMs = 1_000_000;
  const tried: string[] = [];
  const pool = createPooledClient([member('m1', [], 429, { 'retry-after': '60' }), member('m2', okChunks)], {
    maxFailover: 2,
    now: () => nowMs,
    cooldowns: new Map(),
    onAttempt: (m) => tried.push(m)
  });
  await collect(pool, baseReq);
  tried.length = 0;
  const e2 = await collect(pool, baseReq);
  const skipped = tried.join(',') === 'm2' && e2[0]?.type === 'model' && e2[0].failovers === 1;
  nowMs += 61_000;
  tried.length = 0;
  await collect(pool, baseReq);
  ok('(14) cooldown dilewati, dibuka lagi setelah jeda', skipped && tried.join(',') === 'm1,m2', tried.join(','));
}

{
  const events = await collect(createLlmClient({ provider: 'groq', apiKey: 'k' }, fakeFetch(okChunks)), baseReq);
  ok('(15) createLlmClient: model pertama', isModelFirst(events), JSON.stringify(events[0]));
  let unknown = '';
  try {
    createLlmClient({ provider: 'xxxxx', apiKey: 'k' });
  } catch (e) {
    unknown = String(e);
  }
  ok('(15) penyedia tak dikenal menyebut daftar', unknown.includes('groq'), unknown);
}

{
  const tried: string[] = [];
  const pool = createPooledClient([member('m1', [], 401), member('m2', okChunks)], {
    maxFailover: 2,
    cooldowns: new Map(),
    onAttempt: (m) => tried.push(m)
  });
  const err = await collectFails(pool, baseReq);
  ok('(16) 401 tidak pindah', err instanceof LlmHttpError && err.status === 401 && tried.join(',') === 'm1', `${String(err)} tried=${tried}`);
}

{
  const tried: string[] = [];
  const pool = createPooledClient([member('m1', [], 400), member('m2', okChunks)], {
    maxFailover: 2,
    cooldowns: new Map(),
    onAttempt: (m) => tried.push(m)
  });
  const err = await collectFails(pool, baseReq);
  ok('(17) 400 tidak pindah', err instanceof LlmHttpError && err.status === 400 && tried.join(',') === 'm1', `${String(err)} tried=${tried}`);
}

{
  const tried: string[] = [];
  const abortFetch = (() => Promise.reject(new DOMException('dibatalkan', 'AbortError'))) as typeof fetch;
  const pool = createPooledClient(
    [
      { model: 'm1', client: createOpenAiCompatClient({ baseUrl: 'https://x.test', apiKey: 'k', model: 'm1', fetchImpl: abortFetch }) },
      member('m2', okChunks)
    ],
    { maxFailover: 2, cooldowns: new Map(), onAttempt: (m) => tried.push(m) }
  );
  const err = await collectFails(pool, baseReq);
  ok('(18) abort tidak pindah', err instanceof DOMException && err.name === 'AbortError' && tried.join(',') === 'm1', `${String(err)} tried=${tried}`);
}

{
  const tried: string[] = [];
  const poolA = createPooledClient([member('q1', [], 429), member('q2', okChunks)], { maxFailover: 2 });
  await collect(poolA, baseReq);
  const poolB = createPooledClient([member('q1', [], 429), member('q2', okChunks)], {
    maxFailover: 2,
    onAttempt: (m) => tried.push(m)
  });
  const events = await collect(poolB, baseReq);
  ok('(19) cooldown dibagi antar kolam', tried.join(',') === 'q2' && events[0]?.type === 'model' && events[0].model === 'q2', tried.join(','));
}

{
  const bodies: Record<string, unknown>[] = [];
  const capFetch = (async (_url: unknown, init: unknown) => {
    const body = JSON.parse((init as { body: string }).body) as Record<string, unknown>;
    bodies.push(body);
    if (body['model'] === 'openai/gpt-oss-20b') return sse([], 429);
    return sse(okChunks);
  }) as typeof fetch;
  const client = createLlmClient({ provider: 'groq', apiKey: 'k', models: ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b'] }, capFetch);
  const events = await collect(client, baseReq);
  ok(
    '(20) extraBody per model',
    bodies.length === 2 && bodies[0]['reasoning_effort'] === 'low' && bodies[1]['reasoning_effort'] === 'none' && bodies[1]['include_reasoning'] === undefined && events[0]?.type === 'model' && events[0].model === 'qwen/qwen3.8-27b',
    JSON.stringify(bodies.map((b) => ({ model: b['model'], reasoning_effort: b['reasoning_effort'] })))
  );
}

{
  const nowMs = 5_000_000;
  const tried: string[] = [];
  const pool = createPooledClient([member('m1', okChunks), member('m2', okChunks)], {
    maxFailover: 2,
    now: () => nowMs,
    cooldowns: new Map([['m1', nowMs + 60_000]]),
    onAttempt: (m) => tried.push(m)
  });
  const events = await collect(pool, baseReq);
  const first = events[0];
  ok('(21) cooldown dilewati terhitung failover', first?.type === 'model' && first.model === 'm2' && first.failovers === 1 && tried.join(',') === 'm2', JSON.stringify({ first, tried }));
}

{
  const pool = createPooledClient([member('m1', [], 429, { 'retry-after': '5' }), member('m2', [], 429, { 'retry-after': '30' })], { maxFailover: 2, cooldowns: new Map() });
  const err = await collectFails(pool, baseReq);
  ok('(22) 429 memakai Retry-After terbesar', err instanceof LlmHttpError && err.status === 429 && err.retryAfterMs === 30000, String(err));
}

{
  const bodies: Record<string, unknown>[] = [];
  const qwenFetch = (async (_url: unknown, init: unknown) => {
    bodies.push(JSON.parse((init as { body: string }).body) as Record<string, unknown>);
    return sse([
      chunk({ content: 'Siap', reasoning: 'pikir' }),
      chunk({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'get_summary', arguments: '{"period":"today"}' } }] }),
      chunk({}, 'tool_calls'),
      DONE
    ]);
  }) as typeof fetch;
  const client = createLlmClient({ provider: 'groq', apiKey: 'k', models: ['qwen/qwen3.8-27b'] }, qwenFetch);
  const events = await collect(client, baseReq);
  const call = events.find((e) => e.type === 'tool_call');
  ok(
    '(23) kontrak qwen: body + tool_call',
    bodies.length === 1 &&
      bodies[0]['model'] === 'qwen/qwen3.8-27b' &&
      bodies[0]['reasoning_effort'] === 'none' &&
      !('include_reasoning' in bodies[0]) &&
      call?.type === 'tool_call' &&
      call.argsJson === '{"period":"today"}' &&
      !JSON.stringify(events).includes('pikir'),
    JSON.stringify(bodies)
  );
}

if (process.argv.includes('--live')) {
  console.log('\n== live (Groq nyata) ==');
  const key = process.env.LLM_API_KEY ?? '';
  if (!key) {
    console.log('  SKIP: LLM_API_KEY kosong');
  } else {
    for (const model of ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b']) {
      const liveClient = createLlmClient({ provider: 'groq', apiKey: key, models: [model] });
      const liveEvents = await collect(liveClient, {
        system: 'Panggil tool yang tersedia.',
        messages: [{ role: 'user', content: 'Panggil tool get_test sekarang.' }],
        tools: [{ name: 'get_test', description: 'Tool uji yang wajib dipanggil.', parameters: { type: 'object', properties: {} } }],
        toolChoice: 'auto',
        maxTokens: 600,
        temperature: 0
      });
      ok(`live ${model}: tool_call muncul`, liveEvents.some((e) => e.type === 'tool_call'), JSON.stringify(liveEvents).slice(0, 400));
      ok(`live ${model}: usage muncul`, liveEvents.some((e) => e.type === 'usage'), JSON.stringify(liveEvents).slice(0, 400));
    }
  }
}

console.log(`\n${passCount} passed, ${failCount} failed\n`);
if (failCount > 0) process.exit(1);

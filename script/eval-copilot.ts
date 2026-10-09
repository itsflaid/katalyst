import 'dotenv/config';

interface EvalCase {
  id: string;
  question: string;
  expectTools: string[];
  expectArgs?: Record<string, Record<string, string>>;
  requireProduct?: boolean;
  note: string;
}

interface CallInfo {
  name: string;
  args: unknown;
}

interface DoneInfo {
  model: string;
  inputTokens: number;
  outputTokens: number;
  budgetUsed: number;
  toolCalls: string[];
}

function flagValue(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

function printHelp(): void {
  console.log(`Pakai: tsx script/eval-copilot.ts [--only E13,E20] [--max-tokens N]
  --only        jalankan id kasus tertentu, pisah koma
  --max-tokens  berhenti bila total token masuk melebihi N (default 120000)
Env: EVAL_BASE_URL (default http://localhost:5173), EVAL_COOKIE (kuki sesi owner),
  EVAL_PRODUCT (nama produk nyata untuk kasus SIM_REAL; wajib untuk kasus itu),
  LLM_API_KEY dipakai server lokal, bukan skrip ini.`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
}

function buildCases(): { runnable: EvalCase[]; skipped: string[] } {
  const product = (process.env.EVAL_PRODUCT ?? '').trim();
  const runnable: EvalCase[] = [];
  const skipped: string[] = [];
  if (product) {
    runnable.push({
      id: 'SIM_REAL',
      question: `Kalau harga ${product} naik 2 ribu gimana?`,
      expectTools: ['simulate_price'],
      expectArgs: { simulate_price: { product } },
      note: 'simulasi produk nyata; nilai manusia: dua skenario volume disebut sebagai asumsi'
    });
  } else {
    skipped.push('SIM_REAL dilewati: EVAL_PRODUCT kosong.');
  }
  runnable.push(
    {
      id: 'EXPLAIN_MONTH',
      question: 'Kenapa profit turun bulan ini?',
      expectTools: ['explain_change'],
      expectArgs: { explain_change: { period: 'this_month' } },
      note: 'nilai manusia: arah tiap faktor dari effectText'
    },
    {
      id: 'E13',
      question: 'Hari apa paling ramai dalam 3 bulan terakhir?',
      expectTools: ['query_metrics'],
      expectArgs: { query_metrics: { metric: 'tx_count', group_by: 'weekday', period: 'last_90d', order: 'desc' } },
      note: 'nilai manusia: jawaban menyebut rata-rata per hari'
    },
    {
      id: 'E17',
      question: 'Margin per hari 2 minggu terakhir, kapan paling tipis?',
      expectTools: ['query_metrics'],
      expectArgs: { query_metrics: { metric: 'margin', group_by: 'day', order: 'asc' } },
      note: 'nilai manusia: peringkat tidak memuat hari tanpa penjualan'
    },
    {
      id: 'E19',
      question: 'Rata-rata belanja per struk hari Sabtu dibanding Senin?',
      expectTools: ['query_metrics'],
      expectArgs: { query_metrics: { metric: 'avg_ticket', group_by: 'weekday' } },
      note: 'nilai manusia: baris tanpa penjualan berlabel "tidak ada penjualan"'
    },
    {
      id: 'E20',
      question: 'Amplang paling laku hari apa?',
      expectTools: ['query_metrics'],
      expectArgs: { query_metrics: { metric: 'qty', group_by: 'weekday' } },
      requireProduct: true,
      note: 'nilai manusia: hasil dikaitkan ke produk yang benar'
    },
    {
      id: 'E11',
      question: `Ubah harga ${product || 'Bolu Cinta'} jadi 40 ribu`,
      expectTools: [],
      note: 'nilai manusia: menolak mengubah data, menawarkan simulasi, tanpa tool call'
    }
  );
  return { runnable, skipped };
}

async function postChat(base: string, cookie: string, question: string): Promise<{ calls: CallInfo[]; done: DoneInfo | null; error: { code: string; retryAfterSec?: number } | null }> {
  const res = await fetch(`${base}/copilot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: base },
    body: JSON.stringify({ messages: [{ role: 'user', content: question }] })
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    const code = (body as { code?: string }).code ?? `HTTP_${res.status}`;
    return { calls: [], done: null, error: { code } };
  }
  const calls: CallInfo[] = [];
  let done: DoneInfo | null = null;
  let error: { code: string; retryAfterSec?: number } | null = null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    buffer += decoder.decode(next.value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const raw of events) {
      const event = raw.match(/^event: (.+)$/m)?.[1];
      const line = raw.match(/^data: (.+)$/m)?.[1];
      if (!event || !line) continue;
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(line);
      } catch {
        continue;
      }
      if (event === 'tool_start') calls.push({ name: String(data.name), args: data.args });
      else if (event === 'done') {
        const usage = data.usage as { inputTokens: number; outputTokens: number };
        done = { model: String(data.model ?? ''), inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0, budgetUsed: Number(data.budgetUsed ?? 0), toolCalls: (data.toolCalls as string[]) ?? [] };
      } else if (event === 'error') {
        error = { code: String(data.code ?? 'UNKNOWN'), ...(typeof data.retryAfterSec === 'number' ? { retryAfterSec: data.retryAfterSec } : {}) };
      }
    }
  }
  return { calls, done, error };
}

function checkCase(c: EvalCase, calls: CallInfo[]): { pass: boolean; detail: string } {
  if (c.expectTools.length === 0) {
    return calls.length === 0 ? { pass: true, detail: 'tanpa tool call' } : { pass: false, detail: `memanggil ${calls.map((t) => t.name).join(',')}` };
  }
  for (const name of c.expectTools) {
    const found = calls.find((t) => t.name === name);
    if (!found) return { pass: false, detail: `${name} tidak dipanggil` };
    const subset = c.expectArgs?.[name] ?? {};
    const args = (typeof found.args === 'object' && found.args !== null ? found.args : {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(subset)) {
      if (String(args[key] ?? '') !== value) return { pass: false, detail: `${name}.${key}=${String(args[key] ?? '')} bukan ${value}` };
    }
    if (c.requireProduct && !args['product']) return { pass: false, detail: `${name} tanpa argumen product` };
  }
  return { pass: true, detail: c.expectTools.join(',') };
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    return;
  }
  const base = process.env.EVAL_BASE_URL ?? 'http://localhost:5173';
  const cookie = process.env.EVAL_COOKIE ?? '';
  if (!cookie) {
    console.log('EVAL_COOKIE kosong: isi kuki sesi owner agar skrip bisa memanggil server lokal.');
    printHelp();
    return;
  }
  try {
    await fetch(`${base}/copilot/conversations`, { headers: { Cookie: cookie } });
  } catch {
    console.log(`Server lokal ${base} tidak terjangkau: jalankan npm run dev dulu.`);
    printHelp();
    return;
  }
  const maxTokens = Number(flagValue('--max-tokens') ?? '120000');
  const onlyRaw = flagValue('--only');
  const only = onlyRaw ? onlyRaw.split(',').map((s) => s.trim()).filter(Boolean) : null;
  const { runnable, skipped } = buildCases();
  for (const s of skipped) console.log(`SKIP: ${s}`);
  const selected = only ? runnable.filter((c) => only.includes(c.id)) : runnable;
  if (only) {
    const unknown = only.filter((id) => !runnable.some((c) => c.id === id));
    for (const id of unknown) console.log(`SKIP: ${id} tidak dikenal.`);
  }
  let totalInput = 0;
  let rateLimited = 0;
  let autoPass = 0;
  const inputs: number[] = [];
  const perModel = new Map<string, number>();
  for (let i = 0; i < selected.length; i++) {
    const c = selected[i];
    let attempt = 0;
    let result = await postChat(base, cookie, c.question);
    if (result.error?.code === 'RATE_LIMITED') {
      rateLimited++;
      await sleep((result.error.retryAfterSec ?? 60) * 1000);
      attempt++;
      result = await postChat(base, cookie, c.question);
    }
    const checked = checkCase(c, result.calls);
    if (checked.pass) autoPass++;
    const input = result.done?.inputTokens ?? 0;
    const output = result.done?.outputTokens ?? 0;
    totalInput += input;
    inputs.push(input);
    if (result.done?.model) perModel.set(result.done.model, (perModel.get(result.done.model) ?? 0) + 1);
    console.log(`${c.id} tool=[${result.calls.map((t) => t.name).join(',')}] args=${JSON.stringify(result.calls.map((t) => t.args))} model=${result.done?.model ?? '-'} in=${input} out=${output} budget=${result.done?.budgetUsed ?? '-'} cek=${checked.pass ? 'LOLOS' : `GAGAL ${checked.detail}`} manusia: ${c.note}${attempt > 0 ? ' (ulang 1x)' : ''}`);
    if (totalInput > maxTokens) {
      console.log(`Berhenti: total token masuk ${totalInput} melebihi ${maxTokens}.`);
      break;
    }
    if (i < selected.length - 1) await sleep(15000);
  }
  inputs.sort((a, b) => a - b);
  console.log(`\nkasus=${selected.length} lolos-otomatis=${autoPass} p50=${quantile(inputs, 0.5)} p95=${quantile(inputs, 0.95)} model=${[...perModel].map(([m, n]) => `${m}x${n}`).join(',') || '-'} RATE_LIMITED=${rateLimited}`);
}

void main();

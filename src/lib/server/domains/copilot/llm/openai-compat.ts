import { LlmHttpError, type LlmClient, type LlmEvent, type LlmRequest } from './types';

export interface OpenAiCompatOpts {
  baseUrl: string;
  apiKey: string;
  model: string;
  extraBody?: Record<string, unknown>;
  parallelToolCalls?: boolean;
  usageInStream?: boolean;
  fetchImpl?: typeof fetch;
}

interface ToolPart {
  id: string;
  name: string;
  args: string;
}

// Header Retry-After Groq dalam detik; selain angka berarti tak ada.
function retryAfterMsOf(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header.trim());
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

function toOpenAiMessages(req: LlmRequest): unknown[] {
  const out: unknown[] = [{ role: 'system', content: req.system }];
  for (const m of req.messages) {
    if (m.role === 'assistant' && m.toolCalls) {
      out.push({
        role: 'assistant',
        content: m.content,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: c.argsJson }
        }))
      });
    } else if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

function addPart(parts: Map<number, ToolPart>, raw: unknown): void {
  const c = raw as { index?: unknown; id?: unknown; function?: { name?: unknown; arguments?: unknown } };
  const index = typeof c.index === 'number' ? c.index : 1e9 + parts.size;
  const part = parts.get(index) ?? { id: '', name: '', args: '' };
  if (typeof c.id === 'string' && c.id) part.id = c.id;
  if (typeof c.function?.name === 'string' && c.function.name) part.name = c.function.name;
  if (typeof c.function?.arguments === 'string') part.args += c.function.arguments;
  parts.set(index, part);
}

function finishOf(reason: string | null): LlmEvent {
  if (reason === 'stop' || reason === 'tool_calls' || reason === 'length') {
    return { type: 'finish', reason };
  }
  return { type: 'finish', reason: 'error' };
}

async function* readEvents(body: ReadableStream<Uint8Array>): AsyncIterable<LlmEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let closed = false;
  const parts = new Map<number, ToolPart>();
  let usage: LlmEvent | null = null;
  let finishReason: string | null = null;
  try {
    while (!closed) {
      const { done, value } = await reader.read();
      if (value) buf += decoder.decode(value, { stream: !done });
      if (done) break;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t || t.startsWith(':') || t.startsWith('event:') || !t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') {
          closed = true;
          break;
        }
        let json: { choices?: { delta?: { content?: unknown; tool_calls?: unknown }; finish_reason?: unknown }[]; usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } };
        try {
          json = JSON.parse(payload);
        } catch {
          yield { type: 'finish', reason: 'error' };
          return;
        }
        const choice = json.choices?.[0];
        const delta = choice?.delta;
        if (typeof delta?.content === 'string' && delta.content) {
          yield { type: 'text', delta: delta.content };
        }
        if (Array.isArray(delta?.tool_calls)) {
          for (const c of delta.tool_calls) addPart(parts, c);
        }
        if (typeof choice?.finish_reason === 'string' && choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
        const u = json.usage;
        if (typeof u?.prompt_tokens === 'number' && typeof u?.completion_tokens === 'number') {
          usage = { type: 'usage', inputTokens: u.prompt_tokens, outputTokens: u.completion_tokens };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  for (const index of [...parts.keys()].sort((a, b) => a - b)) {
    const p = parts.get(index) as ToolPart;
    yield { type: 'tool_call', id: p.id, name: p.name, argsJson: p.args };
  }
  if (usage) yield usage;
  yield finishOf(finishReason);
}

export function createOpenAiCompatClient(opts: OpenAiCompatOpts): LlmClient {
  const run = opts.fetchImpl ?? fetch;
  return {
    async *stream(req: LlmRequest, signal: AbortSignal): AsyncIterable<LlmEvent> {
      const body: Record<string, unknown> = {
        model: opts.model,
        messages: toOpenAiMessages(req),
        stream: true,
        max_tokens: req.maxTokens,
        temperature: req.temperature,
        ...opts.extraBody
      };
      if (req.tools.length > 0) {
        body.tools = req.tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters }
        }));
        body.tool_choice = req.toolChoice;
      }
      if (opts.parallelToolCalls !== undefined) body.parallel_tool_calls = opts.parallelToolCalls;
      if (opts.usageInStream) body.stream_options = { include_usage: true };
      const res = await run(`${opts.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal
      });
      if (!res.ok) throw new LlmHttpError(res.status, retryAfterMsOf(res.headers.get('retry-after')));
      yield { type: 'model', model: opts.model, failovers: 0 };
      yield* readEvents(res.body as ReadableStream<Uint8Array>);
    }
  };
}

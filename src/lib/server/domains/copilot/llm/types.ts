export type JsonSchema = Record<string, unknown>;

export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export type LlmMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: { id: string; name: string; argsJson: string }[] }
  | { role: 'tool'; toolCallId: string; content: string };

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools: ToolSpec[];
  toolChoice: 'auto' | 'none';
  maxTokens: number;
  temperature: number;
}

export type LlmEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; id: string; name: string; argsJson: string }
  | { type: 'model'; model: string; failovers: number }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'finish'; reason: 'stop' | 'tool_calls' | 'length' | 'error' };

export interface LlmClient {
  stream(req: LlmRequest, signal: AbortSignal): AsyncIterable<LlmEvent>;
}

export class LlmHttpError extends Error {
  status: number;
  retryAfterMs: number | null;

  constructor(status: number, retryAfterMs: number | null, message?: string) {
    super(message ?? `LLM HTTP ${status}`);
    this.name = 'LlmHttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

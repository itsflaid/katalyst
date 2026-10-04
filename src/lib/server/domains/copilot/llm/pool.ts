import { LlmHttpError, type LlmClient, type LlmEvent, type LlmRequest } from './types';

export interface PoolMember {
  model: string;
  client: LlmClient;
}

export interface PoolOpts {
  maxFailover: number;
  cooldownMs?: number;
  now?: () => number;
  onAttempt?: (model: string) => void;
}

const FALLBACK_COOLDOWN_MS = 60000;
const MAX_COOLDOWN_MS = 3600000;

export function createPooledClient(members: PoolMember[], opts: PoolOpts): LlmClient {
  if (members.length === 0) throw new Error('Kolam LLM kosong: isi minimal satu model.');
  const clock = opts.now ?? Date.now;
  const fallbackCooldown = opts.cooldownMs ?? FALLBACK_COOLDOWN_MS;
  const coolingUntil = new Map<string, number>();

  function pickNext(tried: Set<number>): number {
    let firstUntried = -1;
    for (let i = 0; i < members.length; i++) {
      if (tried.has(i)) continue;
      if (firstUntried === -1) firstUntried = i;
      if ((coolingUntil.get(members[i].model) ?? 0) <= clock()) return i;
    }
    return firstUntried;
  }

  async function* run(req: LlmRequest, signal: AbortSignal): AsyncIterable<LlmEvent> {
    const tried = new Set<number>();
    let failures = 0;
    let lastError: unknown = new LlmHttpError(500, null, 'Semua model gagal.');
    for (let attempt = 0; attempt <= opts.maxFailover; attempt++) {
      const index = pickNext(tried);
      if (index === -1) break;
      tried.add(index);
      opts.onAttempt?.(members[index].model);
      let seenFirst = false;
      try {
        for await (const event of members[index].client.stream(req, signal)) {
          seenFirst = true;
          yield event.type === 'model' ? { ...event, failovers: failures } : event;
        }
        return;
      } catch (error) {
        if (!seenFirst) {
          lastError = error;
          failures++;
          if (error instanceof LlmHttpError && error.status === 429) {
            const wait = Math.min(error.retryAfterMs ?? fallbackCooldown, MAX_COOLDOWN_MS);
            coolingUntil.set(members[index].model, clock() + wait);
          }
        } else {
          throw error;
        }
      }
    }
    throw lastError;
  }

  return { stream: (req, signal) => run(req, signal) };
}

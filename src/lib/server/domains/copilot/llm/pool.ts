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
  cooldowns?: Map<string, number>;
}

const FALLBACK_COOLDOWN_MS = 60000;
const MAX_COOLDOWN_MS = 3600000;

// Satu isolate memakai ulang modul ini: cooldown dibagi semua kolam.
const sharedCooldowns = new Map<string, number>();

// Hanya 429, model dicabut, galat server, dan gagal jaringan yang pindah model.
function failoverable(error: unknown): boolean {
  if (error instanceof LlmHttpError) {
    return error.status === 429 || error.status === 404 || error.status >= 500;
  }
  return error instanceof Error ? error.name !== 'AbortError' : true;
}

export function createPooledClient(members: PoolMember[], opts: PoolOpts): LlmClient {
  if (members.length === 0) throw new Error('Kolam LLM kosong: isi minimal satu model.');
  const clock = opts.now ?? Date.now;
  const fallbackCooldown = opts.cooldownMs ?? FALLBACK_COOLDOWN_MS;
  const cooling = opts.cooldowns ?? sharedCooldowns;

  function pickNext(tried: Set<number>): number {
    let firstUntried = -1;
    for (let i = 0; i < members.length; i++) {
      if (tried.has(i)) continue;
      if (firstUntried === -1) firstUntried = i;
      if ((cooling.get(members[i].model) ?? 0) <= clock()) return i;
    }
    return firstUntried;
  }

  async function* run(req: LlmRequest, signal: AbortSignal): AsyncIterable<LlmEvent> {
    const tried = new Set<number>();
    let failures = 0;
    let maxRetry: number | null = null;
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
          if (event.type !== 'model') {
            yield event;
            continue;
          }
          // Anggota cooldown yang dilewati sebelum pelayan ikut dihitung.
          let skipped = 0;
          for (let j = 0; j < index; j++) {
            if (!tried.has(j) && (cooling.get(members[j].model) ?? 0) > clock()) skipped++;
          }
          yield { ...event, failovers: failures + skipped };
        }
        return;
      } catch (error) {
        if (seenFirst || !failoverable(error)) throw error;
        lastError = error;
        failures++;
        if (error instanceof LlmHttpError && (error.status === 429 || error.status === 404)) {
          const wait = Math.min(error.retryAfterMs ?? fallbackCooldown, MAX_COOLDOWN_MS);
          cooling.set(members[index].model, clock() + wait);
        }
        if (error instanceof LlmHttpError && error.status === 429 && error.retryAfterMs !== null) {
          maxRetry = maxRetry === null ? error.retryAfterMs : Math.max(maxRetry, error.retryAfterMs);
        }
      }
    }
    // Pesan 429 memakai Retry-After terbesar yang diketahui.
    if (lastError instanceof LlmHttpError && lastError.status === 429) lastError.retryAfterMs = maxRetry;
    throw lastError;
  }

  return { stream: (req, signal) => run(req, signal) };
}

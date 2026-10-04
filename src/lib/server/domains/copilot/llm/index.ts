import { createOpenAiCompatClient } from './openai-compat';
import { createPooledClient } from './pool';
import { PROFILES } from './profiles';
import type { LlmClient } from './types';

export interface LlmConfig {
  provider: string;
  apiKey: string;
  models?: string[];
  baseUrl?: string;
  maxFailover?: number;
}

export function createLlmClient(cfg: LlmConfig, fetchImpl?: typeof fetch): LlmClient {
  const profile = PROFILES[cfg.provider];
  if (!profile) {
    throw new Error(`Penyedia LLM tak dikenal: ${cfg.provider} (tersedia: ${Object.keys(PROFILES).join(', ')})`);
  }
  const models = cfg.models && cfg.models.length > 0 ? cfg.models : profile.defaultModels;
  const members = models.map((model) => ({
    model,
    client: createOpenAiCompatClient({
      baseUrl: cfg.baseUrl ?? profile.baseUrl,
      apiKey: cfg.apiKey,
      model,
      extraBody: profile.extraBody,
      parallelToolCalls: profile.parallelToolCalls,
      usageInStream: profile.usageInStream,
      fetchImpl
    })
  }));
  return createPooledClient(members, { maxFailover: cfg.maxFailover ?? 2 });
}

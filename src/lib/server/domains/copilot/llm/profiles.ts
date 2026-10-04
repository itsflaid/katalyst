export interface ProviderProfile {
  id: string;
  baseUrl: string;
  defaultModels: string[];
  extraBodyByModel?: Record<string, Record<string, unknown>>;
  parallelToolCalls?: boolean;
  usageInStream: boolean;
}

// Kolam awal sementara; anggota final ditentukan eval.
export const PROFILES: Record<string, ProviderProfile> = {
  groq: {
    id: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModels: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
    // Penalaran diset serendah mungkin: token penalaran memakan kuota keluaran.
    extraBodyByModel: {
      'openai/gpt-oss-120b': { reasoning_effort: 'low', include_reasoning: false },
      'openai/gpt-oss-20b': { reasoning_effort: 'low', include_reasoning: false }
    },
    usageInStream: false
  }
};

export interface GroundingResult {
  ok: boolean;
  unsupported: string[];
}

function textValues(value: unknown, out: string[]) {
  if (Array.isArray(value)) {
    value.forEach((item) => textValues(item, out));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key.endsWith('Text') && typeof item === 'string') out.push(item);
    textValues(item, out);
  }
}

function numberTokens(value: string): string[] {
  return value.match(/(?:[-+]?Rp\d[\d.]*)|(?:[-+]?\d+(?:,\d+)?%)/g) ?? [];
}

export function verifyGrounding(text: string, toolResults: unknown[]): GroundingResult {
  const allowedTexts: string[] = [];
  toolResults.forEach((result) => textValues(result, allowedTexts));
  const allowed = new Set(allowedTexts.flatMap(numberTokens));
  const unsupported = numberTokens(text).filter((token) => !allowed.has(token));
  return { ok: unsupported.length === 0, unsupported };
}

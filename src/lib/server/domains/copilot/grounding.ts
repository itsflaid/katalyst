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

// Token dibandingkan tanpa tanda depan: "turun 18,0%" sah untuk "-18,0%".
// Rupiah wajib berakhir digit agar titik akhir kalimat tidak ikut termakan.
function normalize(token: string): string {
  return token.replace(/\s+/g, '').replace(/^[+-]/, '');
}

function numberTokens(value: string): string[] {
  const found =
    value.match(/[+-]?Rp\d(?:[\d.]*\d)?(,\d+)?|[+-]?\d+(,\d+)?%|[+-]?\d+(,\d+)? poin|\d[\d.]*(,\d+)? (unit|pcs|hari|struk|transaksi|produk)\b/g) ?? [];
  return found.map(normalize);
}

export function verifyGrounding(text: string, toolResults: unknown[]): GroundingResult {
  const allowedTexts: string[] = [];
  toolResults.forEach((result) => textValues(result, allowedTexts));
  const allowed = new Set(allowedTexts.flatMap(numberTokens));
  const unsupported = numberTokens(text).filter((token) => !allowed.has(token));
  return { ok: unsupported.length === 0, unsupported };
}

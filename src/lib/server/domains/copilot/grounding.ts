export interface GroundingResult {
  ok: boolean;
  unsupported: string[];
}

// Bilangan yang ditulis dengan kata ("dua kali lipat") tidak diperiksa;
// pemeriksa hanya membaca digit.

function collectAllow(value: unknown, strings: string[], numbers: number[]) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectAllow(item, strings, numbers));
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    numbers.push(value);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (
      typeof item === 'string' &&
      (key.endsWith('Text') || key === 'label' || key.endsWith('Label') || key === 'summary')
    ) {
      strings.push(item);
    }
    collectAllow(item, strings, numbers);
  }
}

// Token dibandingkan tanpa tanda depan: "turun 18,0%" sah untuk "-18,0%".
// Rupiah wajib berakhir digit agar titik akhir kalimat tidak ikut termakan.
function normalize(token: string): string {
  return token.replace(/\s+/g, '').replace(/^[+-]/, '');
}

// Angka format Indonesia: titik = ribuan, koma = desimal.
function parseAmount(raw: string): number | null {
  const compact = raw.replace(/\s+/g, '');
  const match = /^(\d[\d.]*)(,\d+)?$/.exec(compact);
  if (!match) return null;
  const intPart = match[1].replace(/\./g, '');
  if (!intPart) return null;
  const value = Number(intPart + (match[2] ? `.${match[2].slice(1)}` : ''));
  return Number.isFinite(value) ? value : null;
}

const RUPIAH_RE = /[+-]?Rp\d(?:[\d.]*\d)?(,\d+)?/g;
const PERCENT_RE = /[+-]?\d+(,\d+)?%/g;
const POINTS_RE = /[+-]?\d+(,\d+)? poin/g;
const UNIT_RE = /\d[\d.]*(,\d+)? (unit|pcs|hari|struk|transaksi|produk)\b/g;
const AMOUNT_RE = /\d[\d.]*(,\d+)?/g;
const SPACE_RUPIAH_RE = /Rp\s+\d[\d.]*(,\d+)?/g;
const SHORTHAND_RE = /\d[\d.]*(,\d+)?\s*(juta|jt|miliar|ribu|rb|k)\b/gi;
const WORD_RUPIAH_RE = /\d[\d.]*(,\d+)?\s*rupiah/gi;

function tokensOf(pattern: RegExp, value: string): string[] {
  return (value.match(pattern) ?? []).map(normalize);
}

export function verifyGrounding(text: string, toolResults: unknown[]): GroundingResult {
  const allowStrings: string[] = [];
  const rawNumbers: number[] = [];
  toolResults.forEach((result) => collectAllow(result, allowStrings, rawNumbers));
  for (const n of rawNumbers) {
    if (Number.isInteger(n)) allowStrings.push(String(n));
  }
  const allowed = new Set(allowStrings);
  const allowedRupiah = new Set(allowStrings.flatMap((s) => tokensOf(RUPIAH_RE, s)));
  const allowedPercent = new Set(allowStrings.flatMap((s) => tokensOf(PERCENT_RE, s)));
  const allowedPoints = new Set(allowStrings.flatMap((s) => tokensOf(POINTS_RE, s)));
  const magnitudes = new Set<number>();
  for (const s of allowStrings) {
    for (const raw of s.match(AMOUNT_RE) ?? []) {
      const value = parseAmount(raw);
      if (value !== null) magnitudes.add(value);
    }
  }
  for (const n of rawNumbers) magnitudes.add(n);

  const unsupported: string[] = [];
  const shorthand = [...(text.match(SPACE_RUPIAH_RE) ?? []), ...(text.match(SHORTHAND_RE) ?? []), ...(text.match(WORD_RUPIAH_RE) ?? [])];
  for (const token of shorthand) {
    if (!allowed.has(token)) unsupported.push(token);
  }
  for (const token of tokensOf(RUPIAH_RE, text)) {
    if (!allowedRupiah.has(token)) unsupported.push(token);
  }
  for (const token of tokensOf(PERCENT_RE, text)) {
    if (!allowedPercent.has(token)) unsupported.push(token);
  }
  for (const token of tokensOf(POINTS_RE, text)) {
    if (!allowedPoints.has(token)) unsupported.push(token);
  }
  for (const raw of text.match(UNIT_RE) ?? []) {
    const amount = raw.replace(/\s+\S+$/, '');
    const value = parseAmount(amount);
    if (value === null || !magnitudes.has(value)) unsupported.push(raw);
  }
  return { ok: unsupported.length === 0, unsupported };
}

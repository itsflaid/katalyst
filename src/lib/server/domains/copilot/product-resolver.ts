export interface ProductCandidate {
  id: string;
  name: string;
}

export type ProductResolution =
  | { kind: 'found'; product: ProductCandidate }
  | { kind: 'not_found'; query: string; candidates: ProductCandidate[] }
  | { kind: 'ambiguous'; query: string; candidates: ProductCandidate[] };

// Normalisasi agar varian tulisan setara: huruf kecil, tanpa tanda baca,
// spasi ganda rapat, dan angka menempel ke satuan ("500 g" = "500g").
function normalize(value: string): string {
  return value
    .toLocaleLowerCase('id-ID')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/(\d)\s+(?=[a-z])/g, '$1')
    .trim();
}

function tokensOf(value: string): string[] {
  const normalized = normalize(value);
  return normalized ? normalized.split(' ') : [];
}

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = next;
    }
  }
  return prev[b.length];
}

// Tiap token kueri harus cocok ke token nama; salah ketik kecil (jarak ≤ 2) boleh bila token cukup panjang.
function tokenMatch(queryTokens: string[], nameTokens: string[], fuzzy: boolean): boolean {
  return queryTokens.every((token) =>
    nameTokens.some((word) => word.includes(token) || (fuzzy && token.length >= 4 && word.length >= 4 && distance(token, word) <= 2))
  );
}

function byName(a: ProductCandidate, b: ProductCandidate): number {
  return a.name.localeCompare(b.name, 'id-ID');
}

export function resolveProduct(query: string, products: ProductCandidate[]): ProductResolution {
  const needle = normalize(query);
  if (!needle) return { kind: 'not_found', query, candidates: [] };
  const byId = products.find((product) => product.id === query.trim());
  if (byId) return { kind: 'found', product: byId };
  const exact = products.filter((product) => normalize(product.name) === needle);
  if (exact.length === 1) return { kind: 'found', product: exact[0] };
  const queryTokens = tokensOf(query);
  const subset = products.filter((product) => tokenMatch(queryTokens, tokensOf(product.name), false));
  if (subset.length === 1) return { kind: 'found', product: subset[0] };
  if (subset.length > 1) return { kind: 'ambiguous', query, candidates: [...subset].sort(byName).slice(0, 5) };
  const typo = products.filter((product) => tokenMatch(queryTokens, tokensOf(product.name), true));
  if (typo.length === 1) return { kind: 'found', product: typo[0] };
  if (typo.length > 1) return { kind: 'ambiguous', query, candidates: [...typo].sort(byName).slice(0, 5) };
  const nearest = [...products]
    .map((product) => ({ product, score: distance(needle, normalize(product.name)) }))
    .sort((a, b) => a.score - b.score || byName(a.product, b.product))
    .slice(0, 3)
    .map((entry) => entry.product);
  return { kind: 'not_found', query, candidates: nearest };
}

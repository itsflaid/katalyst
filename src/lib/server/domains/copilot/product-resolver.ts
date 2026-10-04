export interface ProductCandidate {
  id: string;
  name: string;
}

export type ProductResolution =
  | { kind: 'found'; product: ProductCandidate }
  | { kind: 'not_found'; query: string }
  | { kind: 'ambiguous'; query: string; candidates: ProductCandidate[] };

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('id-ID').replace(/\s+/g, ' ');
}

export function resolveProduct(query: string, products: ProductCandidate[]): ProductResolution {
  const needle = normalize(query);
  if (!needle) return { kind: 'not_found', query };
  const exact = products.filter((product) => normalize(product.name) === needle);
  if (exact.length === 1) return { kind: 'found', product: exact[0] };
  const matches = products.filter((product) => normalize(product.name).includes(needle));
  if (matches.length === 1) return { kind: 'found', product: matches[0] };
  if (matches.length > 1) {
    return { kind: 'ambiguous', query, candidates: [...matches].sort((a, b) => a.name.localeCompare(b.name, 'id-ID')).slice(0, 5) };
  }
  return { kind: 'not_found', query };
}

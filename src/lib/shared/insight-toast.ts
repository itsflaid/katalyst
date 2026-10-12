export const INSIGHT_TOAST_KEY = 'katalyst-insight-toast-seen';

// Urutan tidak berpengaruh: tanda yang sama berarti kumpulan insight yang sama.
export function insightSignature(items: { type: string; productId: string }[]): string {
  return items
    .map((i) => `${i.type}:${i.productId}`)
    .sort()
    .join('|');
}

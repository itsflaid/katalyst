export interface ProductMention {
  phrase: string;
  productNames: string[];
}

const STOPWORDS = new Set(['produk', 'paket', 'besar', 'kecil', 'mini', 'super', 'premium', 'original']);

// Huruf kecil, tanpa tanda baca dan diakritik, spasi tunggal.
export function normalizeMention(value: string): string {
  return value
    .toLocaleLowerCase('id-ID')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Kandidat frasa tiap nama katalog: nama lengkap, potongan ≥ 2 kata yang berdampingan,
// dan kata pertama bila ≥ 5 huruf dan bukan stopword umum.
function candidatesOf(name: string): string[][] {
  const words = normalizeMention(name).split(' ').filter(Boolean);
  const out: string[][] = [];
  if (words.length > 0) out.push(words);
  for (let len = 2; len < words.length; len++) {
    for (let start = 0; start + len <= words.length; start++) out.push(words.slice(start, start + len));
  }
  const first = words[0];
  if (first && first.length >= 5 && !STOPWORDS.has(first)) out.push([first]);
  return out;
}

export function detectProductMention(text: string, catalogNames: string[]): ProductMention[] {
  const originalWords = text.split(/\s+/).filter(Boolean);
  const normWords = originalWords.map((w) => normalizeMention(w));
  const byPhrase = new Map<string, { phrase: string; productNames: string[] }>();
  catalogNames.forEach((name) => {
    for (const cand of candidatesOf(name)) {
      for (let i = 0; i + cand.length <= normWords.length; i++) {
        if (!cand.every((w, j) => normWords[i + j] === w)) continue;
        const phrase = originalWords.slice(i, i + cand.length).join(' ');
        const key = normalizeMention(phrase);
        const entry = byPhrase.get(key) ?? { phrase, productNames: [] };
        if (!entry.productNames.includes(name)) entry.productNames.push(name);
        byPhrase.set(key, entry);
      }
    }
  });
  return [...byPhrase.values()];
}

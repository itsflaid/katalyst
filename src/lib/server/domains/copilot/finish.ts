// Teks kepotong batas token: sisakan sampai akhir kalimat terakhir yang utuh; tanpa tanda baca akhir dikembalikan apa adanya.
export function cutToLastSentence(text: string): string {
  const match = /^[\s\S]*[.!?](?=\s|$)/.exec(text);
  return (match ? match[0] : text).trim();
}

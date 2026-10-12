// Serah-terima pertanyaan ke halaman Copilot lewat ?q=. Murni tanpa
// dependensi biar bisa dites skrip tsx.
export const COPILOT_HANDOFF_MAX = 800;

export const COPILOT_SUGGESTIONS = [
  'Omzet minggu ini berapa?',
  'Produk paling laku bulan ini?',
  'Kenapa profit turun?',
  'Stok apa yang menipis?'
];

export function parseHandoffQuestion(search: string): string | null {
  const raw = new URLSearchParams(search).get('q');
  if (raw === null) return null;
  const text = raw.trim().slice(0, COPILOT_HANDOFF_MAX);
  return text === '' ? null : text;
}

export function handoffUrl(question: string): string {
  return '/copilot?q=' + encodeURIComponent(question.trim());
}

// Batas 429 Groq per model: pesan hitung mundur dari Retry-After terbesar (detik, ke atas, maks 120; tak diketahui 60).
export function rateLimitMessage(retryAfterMs: number | null): { retryAfterSec: number; message: string } {
  const retryAfterSec = retryAfterMs === null ? 60 : Math.min(120, Math.max(1, Math.ceil(retryAfterMs / 1000)));
  return { retryAfterSec, message: `Lagi ramai, coba lagi dalam ±${retryAfterSec} detik.` };
}

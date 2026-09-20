// Helper undangan staff — dipakai POST /api/staff, /api/invites, dan
// halaman /invite/[token]. Sengaja pakai Web Crypto (getRandomValues +
// subtle.digest) biar jalan di Node lokal maupun Cloudflare Workers
// (driver neon-http). Jangan pakai node:crypto biar gak jebol di deploy.
export const INVITE_TTL_MS = 48 * 60 * 60 * 1000; // 48 jam

/** Token mentah 64 hex chars (256 bit) — cuma tampil sekali ke owner. */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 hex dari token mentah — yang disimpan di DB (tokenHash unique). */
export async function hashInviteToken(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Username login staff: unik global (seperti email), 3–20 karakter,
// huruf/angka/titik/underscore/strip. Selalu dinormalisasi lowercase+trim
// sebelum disimpan/dibandingkan (aturan yang sama dipakai plugin username
// better-auth di sisi server).
export const USERNAME_RE = /^[a-z0-9._-]+$/;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  const u = normalizeUsername(username);
  return u.length >= 3 && u.length <= 20 && USERNAME_RE.test(u);
}

// Email sintetis buat baris user mana pun (Owner maupun staff). Kolom
// user.email NOT NULL + unique karena better-auth mewajibkannya secara
// struktural (core field, tak bisa dihapus walau plugin username aktif),
// tapi secara fungsional kolom ini mati: tidak pernah dipakai login,
// tidak pernah ditampilkan. Domain `staff.internal` (reserved, tidak bisa
// di-routing) biar jelas bukan email beneran. Tampilan/UI selalu pakai
// name/username.
export function placeholderEmail(username: string): string {
  return `${normalizeUsername(username)}@staff.internal`;
}

// Password sementara buat reset oleh owner — format 4-4 mudah didikte
// via WA/lisan (tanpa karakter ambigu 0/O, 1/l). Selalu ≥ min 6 better-auth.
const TEMP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function generateTempPassword(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => TEMP_ALPHABET[b % TEMP_ALPHABET.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

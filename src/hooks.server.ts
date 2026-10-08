import { auth } from '$lib/server/domains/auth';
import { db } from '$lib/server/db';
import { business } from '$lib/server/db/schema';
import { DEFAULT_TZ, isBizTz } from '$lib/shared/time';
import { eq } from 'drizzle-orm';
import { redirect, type Handle } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';

// Padanan proxy.ts di Next: hook ini harus ada di file bernama persis `src/hooks.server.ts` — nama lain diam-diam diabaikan tanpa build error.
// Proteksi route dipusatkan di sini, bukan dicek manual di tiap +page.server.ts.
const PROTECTED_PATHS = ['/dashboard', '/statistik', '/simulator', '/settings', '/transactions', '/products', '/diskon', '/bantuan', '/copilot', '/akun', '/zakat'];
const OWNER_ONLY_PATHS = ['/dashboard', '/statistik', '/simulator', '/settings', '/copilot', '/diskon', '/products/stok', '/zakat'];

export const handle: Handle = async ({ event, resolve }) => {
  const session = await auth.api.getSession({ headers: event.request.headers });
  event.locals.session = session?.session ?? null;
  event.locals.user = session?.user ?? null;
  // Default: belum diketahui bisnisnya.
  event.locals.business = null;

  const path = event.url.pathname;

  // Signup publik dan admin API tidak dipakai: Owner dari seed, Staff dari invite (auth.api.*, bukan HTTP).
  // Tanpa blokir ini, POST sign-up membuat akun dengan role default OWNER (admin plugin).
  if (path === '/api/auth/sign-up/email' || path.startsWith('/api/auth/admin/')) {
    return new Response(null, { status: 404 });
  }

  const isProtected = PROTECTED_PATHS.some((p) => path.startsWith(p));

  if (isProtected && !event.locals.user) {
    throw redirect(303, '/login');
  }

  if (OWNER_ONLY_PATHS.some((p) => path.startsWith(p)) && event.locals.user?.role !== 'OWNER') {
    throw redirect(303, '/transactions');
  }

  // Isi bisnis sekali per request (kecuali auth API) agar layout & loader
  // tidak query business sendiri-sendiri. Fallback DEFAULT_TZ bila nilai
  // di DB tak valid; null bila baris bisnis tak ada.
  const businessId = (event.locals.user as { businessId?: unknown } | null)?.businessId;
  if (typeof businessId === 'string' && businessId && !path.startsWith('/api/auth')) {
    const [b] = await db
      .select({ id: business.id, name: business.name, timezone: business.timezone })
      .from(business)
      .where(eq(business.id, businessId));
    event.locals.business = b
      ? { id: b.id, name: b.name, timezone: isBizTz(b.timezone) ? b.timezone : DEFAULT_TZ }
      : null;
  }

  // Delegasi ke better-auth buat nangani route /api/auth/* secara internal
  // (refresh session cookie, dll) sebelum lanjut ke resolve() SvelteKit biasa.
  return svelteKitHandler({ event, resolve, auth, building });
};

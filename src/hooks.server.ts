import { auth } from '$lib/server/auth';
import { redirect, type Handle } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';

// Padanan proxy.ts di versi Next: di sana Next.js 16 diam-diam mengabaikan
// file bernama middleware.ts (harus proxy.ts), jadi proteksi Owner-only
// bisa "hilang" tanpa error/warning kalau namanya salah.
//
// SvelteKit punya gotcha yang mirip: hook ini WAJIB ada di file bernama
// persis `src/hooks.server.ts` — nama lain (mis. `src/hook.server.ts` atau
// diletakkan di src/lib/) juga diam-diam diabaikan, tanpa build error.
// Makanya proteksi route dipusatkan di sini, bukan dicek manual di tiap
// +page.server.ts (rawan ke-skip kalau ada yang lupa nambahin check).
const PROTECTED_PATHS = ['/dashboard', '/statistik', '/simulator', '/settings', '/transactions', '/products', '/bantuan', '/copilot', '/akun'];
const OWNER_ONLY_PATHS = ['/dashboard', '/statistik', '/simulator', '/settings', '/copilot', '/products/stok'];

export const handle: Handle = async ({ event, resolve }) => {
  const session = await auth.api.getSession({ headers: event.request.headers });
  event.locals.session = session?.session ?? null;
  event.locals.user = session?.user ?? null;

  const path = event.url.pathname;
  const isProtected = PROTECTED_PATHS.some((p) => path.startsWith(p));

  if (isProtected && !event.locals.user) {
    throw redirect(303, '/login');
  }

  if (OWNER_ONLY_PATHS.some((p) => path.startsWith(p)) && event.locals.user?.role !== 'OWNER') {
    throw redirect(303, '/transactions');
  }

  // Delegasi ke better-auth buat nangani route /api/auth/* secara internal
  // (refresh session cookie, dll) sebelum lanjut ke resolve() SvelteKit biasa.
  return svelteKitHandler({ event, resolve, auth, building });
};

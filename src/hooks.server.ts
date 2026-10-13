import { auth } from '$lib/server/domains/auth';
import { actorOf, recordVisit } from '$lib/server/domains/activity/log';
import { decideAccess, isBlockedAuthPath, normalizePath } from '$lib/server/domains/auth/path-guard';
import { db } from '$lib/server/db';
import { business } from '$lib/server/db/schema';
import { DEFAULT_TZ, isBizTz } from '$lib/shared/time';
import { eq } from 'drizzle-orm';
import { error, redirect, type Handle } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';

// Padanan proxy.ts di Next: hook ini harus ada di file bernama persis `src/hooks.server.ts`; nama lain diam-diam diabaikan tanpa build error.
// Proteksi route dipusatkan di sini, bukan dicek manual di tiap +page.server.ts.

export const handle: Handle = async ({ event, resolve }) => {
  const session = await auth.api.getSession({ headers: event.request.headers });
  event.locals.session = session?.session ?? null;
  event.locals.user = session?.user ?? null;
  // Default: belum diketahui bisnisnya.
  event.locals.business = null;

  let path: string;
  try {
    path = normalizePath(event.url.pathname);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  // Signup publik dan admin API tidak dipakai: Owner dari seed, Staff dari invite (auth.api.*, bukan HTTP).
  // Tanpa blokir ini, POST sign-up membuat akun dengan role default OWNER (admin plugin).
  if (isBlockedAuthPath(path)) {
    return new Response(null, { status: 404 });
  }

  // Keputusan akses terpusat di decideAccess; hooks hanya menerjemahkan hasilnya.
  const verdict = decideAccess(path, event.locals.user);
  if (verdict.kind === 'redirect') throw redirect(303, verdict.to);
  if (verdict.kind === 'forbidden') throw error(403, verdict.message);

  const businessId = (event.locals.user as { businessId?: unknown } | null)?.businessId;

  // Isi bisnis sekali per request (kecuali auth API) agar layout & loader
  // tidak query business sendiri-sendiri. Fallback DEFAULT_TZ bila nilai
  // di DB tak valid; null bila baris bisnis tak ada.
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
  // Kunjungan dicatat setelah response jadi agar tidak menahan render halaman.
  const res = await svelteKitHandler({ event, resolve, auth, building });
  trackVisit(event, path);
  return res;
};

// Hanya dokumen HTML yang sudah login: API, auth internal, dan aset statis tidak dicatat.
function trackVisit(event: Parameters<Handle>[0], path: string): void {
  const biz = event.locals.business;
  const u = event.locals.user;
  if (!biz || !u) return;
  if (path.startsWith('/api/')) return;
  if (!(event.request.headers.get('accept') ?? '').includes('text/html')) return;
  const task = recordVisit({
    businessId: biz.id,
    actor: actorOf(u),
    ip: event.request.headers.get('cf-connecting-ip'),
    userAgent: event.request.headers.get('user-agent')
  });
  const ctx = (event.platform as { context?: { waitUntil?: (p: Promise<unknown>) => void } } | null | undefined)
    ?.context;
  // Dipanggil sebagai method: dilepas dari context melempar Illegal invocation.
  try {
    ctx?.waitUntil?.(task);
  } catch (e) {
    console.error('trackVisit jadwal gagal', e);
  }
}

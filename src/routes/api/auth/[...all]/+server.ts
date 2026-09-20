import { auth } from '$lib/server/domains/auth';
import type { RequestHandler } from './$types';

// Satu handler nangkep semua route better-auth (/api/auth/sign-in, /sign-up,
// /session, dst) — setara [...nextauth]/route.ts tapi better-auth gak butuh
// config provider terpisah, semua di src/lib/server/auth.ts.
export const GET: RequestHandler = ({ request }) => auth.handler(request);
export const POST: RequestHandler = ({ request }) => auth.handler(request);

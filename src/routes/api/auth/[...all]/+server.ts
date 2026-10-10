import { auth } from '$lib/server/domains/auth';
import type { RequestHandler } from './$types';

// Satu handler nangkep semua route better-auth (/api/auth/*); better-auth gak butuh config provider terpisah, semua di src/lib/server/domains/auth.
export const GET: RequestHandler = ({ request }) => auth.handler(request);
export const POST: RequestHandler = ({ request }) => auth.handler(request);

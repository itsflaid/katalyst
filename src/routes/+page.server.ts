import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Route `/` gak punya UI sendiri (+page.svelte cuma stub) — langsung
// arahkan: sudah login -> /transactions (aman untuk OWNER maupun STAFF),
// belum -> /login.
export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) throw redirect(303, '/transactions');
  throw redirect(303, '/login');
};

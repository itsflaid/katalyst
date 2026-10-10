import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// User yang masih punya sesi tidak boleh lihat form login (mis. via tombol Back setelah login).
// Langsung lempar ke halaman awal, mencegah state aneh seperti form login di dalam app shell.
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) return {};
  throw redirect(303, locals.user.role === 'OWNER' ? '/dashboard' : '/transactions');
};

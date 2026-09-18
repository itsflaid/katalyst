import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// User yang masih punya sesi gak boleh lihat form login — mis. via tombol
// Back browser setelah login, atau sesi yang ternyata masih hidup saat
// logout. Langsung lempar ke halaman awal biar gak ada state aneh kayak
// "form login tampil di dalam app shell" atau alur balik-ke-halaman-lama.
export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) throw redirect(303, '/transactions');
  return {};
};

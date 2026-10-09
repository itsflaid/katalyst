import { error, redirect } from '@sveltejs/kit';

// Lapisan kedua bila guard hooks terlewati; dipanggil di awal load/action owner-only.
export function requireOwner(locals: App.Locals): void {
	if (!locals.user) throw redirect(303, '/login');
	if (locals.user.role !== 'OWNER') throw redirect(303, '/transactions');
	if (!locals.user.businessId) throw error(403, 'Akun owner belum terhubung ke bisnis.');
}

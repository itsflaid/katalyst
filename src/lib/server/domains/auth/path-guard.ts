export const PROTECTED_PATHS = [
	'/dashboard',
	'/statistik',
	'/simulator',
	'/settings',
	'/transactions',
	'/products',
	'/diskon',
	'/bantuan',
	'/copilot',
	'/akun',
	'/zakat'
];

export const OWNER_ONLY_PATHS = [
	'/dashboard',
	'/statistik',
	'/simulator',
	'/settings',
	'/copilot',
	'/diskon',
	'/products/stok',
	'/zakat'
];

// Guard membaca path yang sama dengan router: decodeURI per potongan %25 lalu rapikan slash ganda.
export function normalizePath(raw: string): string {
	const decoded = raw.split('%25').map(decodeURI).join('%25');
	return decoded.replace(/\/{2,}/g, '/');
}

// Batas segmen agar /dashboardx tidak ikut /dashboard.
export function matchesPrefix(path: string, prefix: string): boolean {
	return path === prefix || path.startsWith(prefix + '/');
}

export function isProtected(path: string): boolean {
	return PROTECTED_PATHS.some((p) => matchesPrefix(path, p));
}

export function isOwnerOnly(path: string): boolean {
	return OWNER_ONLY_PATHS.some((p) => matchesPrefix(path, p));
}

// Jalur pendaftaran dan admin better-auth tidak dipakai; pemilik dari seed, staff dari undangan.
export function isBlockedAuthPath(path: string): boolean {
	return matchesPrefix(path, '/api/auth/sign-up') || matchesPrefix(path, '/api/auth/admin');
}

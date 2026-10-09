import {
	isBlockedAuthPath,
	isOwnerOnly,
	isProtected,
	matchesPrefix,
	normalizePath
} from '../src/lib/server/domains/auth/path-guard';
import { requireOwner } from '../src/lib/server/domains/auth/guards';

let passCount = 0;
let failCount = 0;
function ok(label: string, cond: boolean, detail = '') {
	if (cond) {
		console.log(`  \x1b[32mPASS\x1b[0m  ${label}`);
		passCount++;
	} else {
		console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? `: ${detail}` : ''}`);
		failCount++;
	}
}

function norm(raw: string): string | null {
	try {
		return normalizePath(raw);
	} catch {
		return null;
	}
}

const cases: { raw: string; want: string | null; prot: boolean; owner: boolean; blocked: boolean }[] = [
	{ raw: '/statistik', want: '/statistik', prot: true, owner: true, blocked: false },
	{ raw: '/%73tatistik', want: '/statistik', prot: true, owner: true, blocked: false },
	{ raw: '/statistik/', want: '/statistik/', prot: true, owner: true, blocked: false },
	{ raw: '//statistik', want: '/statistik', prot: true, owner: true, blocked: false },
	{ raw: '/products/stok', want: '/products/stok', prot: true, owner: true, blocked: false },
	{ raw: '/products/%73tok', want: '/products/stok', prot: true, owner: true, blocked: false },
	{ raw: '/%63opilot/chat', want: '/copilot/chat', prot: true, owner: true, blocked: false },
	{ raw: '/api/auth/sign-up/email', want: '/api/auth/sign-up/email', prot: false, owner: false, blocked: true },
	{ raw: '/api/auth/sign-%75p/email', want: '/api/auth/sign-up/email', prot: false, owner: false, blocked: true },
	{ raw: '/api/auth/admin/list-users', want: '/api/auth/admin/list-users', prot: false, owner: false, blocked: true },
	{ raw: '/dashboardx', want: '/dashboardx', prot: false, owner: false, blocked: false },
	{ raw: '/api/auth/sign-in/username', want: '/api/auth/sign-in/username', prot: false, owner: false, blocked: false }
];

for (const c of cases) {
	const n = norm(c.raw);
	ok(`normalisasi ${c.raw}`, n === c.want, `dapat=${n}`);
	if (n === null) continue;
	ok(`proteksi ${c.raw}`, isProtected(n) === c.prot, `dapat=${isProtected(n)}`);
	ok(`owner-only ${c.raw}`, isOwnerOnly(n) === c.owner, `dapat=${isOwnerOnly(n)}`);
	ok(`blokir auth ${c.raw}`, isBlockedAuthPath(n) === c.blocked, `dapat=${isBlockedAuthPath(n)}`);
}

ok('path rusak melempar', norm('/%E0%A4%A') === null);
ok('%2F bukan pemisah', norm('/dashboard%2Fx') === '/dashboard%2Fx' && !isProtected('/dashboard%2Fx'));
ok('%2F akhir bukan slash', !isProtected(norm('/%73tatistik%2F') ?? ''));
ok('batas awalan ketat', !matchesPrefix('/dashboardx', '/dashboard') && matchesPrefix('/dashboard/x', '/dashboard'));

function thrownOf(fn: () => void): { status?: number; location?: string } {
	try {
		fn();
		return {};
	} catch (e) {
		return e as { status?: number; location?: string };
	}
}

const anon = thrownOf(() => requireOwner({ user: null, session: null, business: null } as never));
ok('anonim ke login', anon.status === 303 && anon.location === '/login', JSON.stringify(anon));
const staff = thrownOf(() => requireOwner({ user: { role: 'STAFF', businessId: 'b1' } } as never));
ok('staff ke transaksi', staff.status === 303 && staff.location === '/transactions', JSON.stringify(staff));
const noBiz = thrownOf(() => requireOwner({ user: { role: 'OWNER', businessId: null } } as never));
ok('owner tanpa bisnis 403', noBiz.status === 403, JSON.stringify(noBiz));
const emptyBiz = thrownOf(() => requireOwner({ user: { role: 'OWNER', businessId: '' } } as never));
ok('owner bisnis kosong 403', emptyBiz.status === 403, JSON.stringify(emptyBiz));
let valid = false;
try {
	requireOwner({ user: { role: 'OWNER', businessId: 'b1' } } as never);
	valid = true;
} catch {
	valid = false;
}
ok('owner valid lolos', valid);

console.log(`\n${passCount} passed, ${failCount} failed\n`);
if (failCount > 0) process.exit(1);

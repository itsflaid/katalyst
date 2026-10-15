// Guard Tenant tanpa DB: locals palsu; exit 1 bila ada FAIL.
import { requireOwner, requireTenant } from '../src/lib/server/domains/auth/guards';

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

type FakeUser = { id: string; role?: unknown; businessId?: unknown };
const localsOf = (user: FakeUser | null) => ({ user }) as App.Locals;

function statusOf(fn: () => unknown): number | 'ok' {
  try {
    fn();
    return 'ok';
  } catch (e) {
    return (e as { status?: number }).status ?? -1;
  }
}

ok('tanpa user 401', statusOf(() => requireTenant(localsOf(null))) === 401);
ok('tanpa bisnis 403', statusOf(() => requireTenant(localsOf({ id: 'u1', role: 'OWNER' }))) === 403);
ok('peran asing 403', statusOf(() => requireTenant(localsOf({ id: 'u1', role: 'BOSS', businessId: 'b1' }))) === 403);
ok('STAFF kena requireOwner 403', statusOf(() => requireOwner(localsOf({ id: 'u1', role: 'STAFF', businessId: 'b1' }))) === 403);

const owner = requireOwner(localsOf({ id: 'u1', role: 'OWNER', businessId: 'b1' }));
ok('OWNER lolos + businessId string', owner.businessId === 'b1' && owner.userId === 'u1' && owner.role === 'OWNER');
ok('user Tenant utuh', owner.user.id === 'u1');

const staff = requireTenant(localsOf({ id: 'u2', role: 'STAFF', businessId: 'b1' }));
ok('STAFF lolos requireTenant', staff.role === 'STAFF' && staff.businessId === 'b1' && staff.userId === 'u2');

console.log(`\n${passCount} passed, ${failCount} failed`);
if (failCount > 0) process.exit(1);

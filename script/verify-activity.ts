import {
  ACTION_FILTERS,
  ACTIVITY_ACTIONS,
  describeActivity,
  describeUserAgent,
  isActivityAction
} from '../src/lib/shared/activity';
import { activityRow } from '../src/lib/server/domains/activity/row';

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

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const EDGE_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0';

ok('ua chrome android', describeUserAgent(CHROME_ANDROID) === 'Chrome · Android', describeUserAgent(CHROME_ANDROID));
ok('ua edge windows', describeUserAgent(EDGE_WINDOWS) === 'Edge · Windows', describeUserAgent(EDGE_WINDOWS));
ok('ua safari iphone jadi iOS bukan macOS', describeUserAgent(SAFARI_IPHONE) === 'Safari · iOS', describeUserAgent(SAFARI_IPHONE));
ok('ua firefox linux', describeUserAgent(FIREFOX_LINUX) === 'Firefox · Linux', describeUserAgent(FIREFOX_LINUX));
ok('ua null tidak dikenal', describeUserAgent(null) === 'Perangkat tidak dikenal');
ok('ua kosong tidak dikenal', describeUserAgent('') === 'Perangkat tidak dikenal');

let threw = false;
try {
  const parts = [
    describeActivity('LOGIN', null),
    describeActivity('LOGIN', 'rusak'),
    describeActivity('TX_CREATE', null),
    describeActivity('TX_CREATE', { total: 'x', itemCount: null }),
    describeActivity('TX_VOID', null),
    describeActivity('TX_VOID', { total: 1 }),
    describeActivity('STAFF_INVITE', null),
    describeActivity('STAFF_DELETE', 42),
    describeActivity('STAFF_PASSWORD_RESET', { username: 7, name: null }),
    describeActivity('STAFF_USERNAME_CHANGE', null),
    describeActivity('PRODUCT_CREATE', 'rusak'),
    describeActivity('PRODUCT_UPDATE', { name: 5, fields: 'x' }),
    describeActivity('PRODUCT_TOGGLE', null),
    describeActivity('PRODUCT_DELETE', 7),
    describeActivity('DISCOUNT_CREATE', null),
    describeActivity('DISCOUNT_UPDATE', { percent: 'besar' }),
    describeActivity('DISCOUNT_TOGGLE', null),
    describeActivity('DISCOUNT_DELETE', null),
    describeActivity('LOGOUT', null),
    describeActivity('STAFF_JOIN', null),
    describeActivity('INVITE_RESEND', null),
    describeActivity('INVITE_REVOKE', null)
  ];
  ok('meta rusak tidak melempar dan bertipe string', parts.every((p) => typeof p === 'string'));
} catch {
  threw = true;
}
ok('meta rusak tidak melempar', !threw);
ok('login tanpa ringkasan', describeActivity('LOGIN', { newDevice: true }) === '');
ok(
  'tx_create memakai rupiah engine',
  describeActivity('TX_CREATE', { total: 45000, itemCount: 3, qty: 5 }) === 'Rp45.000 · 3 jenis, 5 item'
);
ok(
  'tx_void menyebut kasir',
  describeActivity('TX_VOID', { total: 45000, itemCount: 2, cashierName: 'Budi', txCreatedAt: null }) ===
    'Rp45.000 · kasir Budi'
);
ok(
  'staff memakai username dan nama',
  describeActivity('STAFF_INVITE', { username: 'andi', name: 'Andi' }) === '@andi · Andi'
);
ok('staff null dilewati', describeActivity('STAFF_DELETE', { username: null, name: null }) === '');
ok('logout tanpa ringkasan', describeActivity('LOGOUT', null) === '');
ok(
  'username change memakai panah',
  describeActivity('STAFF_USERNAME_CHANGE', { username: 'budi2', oldUsername: 'budi', name: 'Budi' }) === '@budi → @budi2'
);
ok(
  'product create menyebut harga jual',
  describeActivity('PRODUCT_CREATE', { name: 'Beras', sellingPrice: 412000, costPrice: 409850 }) === 'Beras · jual Rp412.000'
);
ok(
  'product update menyebut field',
  describeActivity('PRODUCT_UPDATE', { name: 'Beras', fields: ['jual', 'modal'] }) === 'Beras · ubah jual, modal'
);
ok(
  'product toggle menyebut status',
  describeActivity('PRODUCT_TOGGLE', { name: 'Beras', isActive: false }) === 'Beras · dinonaktifkan'
);
ok('product delete menyebut nama', describeActivity('PRODUCT_DELETE', { name: 'Beras' }) === 'Beras');
ok(
  'discount create menyebut persen',
  describeActivity('DISCOUNT_CREATE', { name: 'Promo', percent: 15, scope: 'GLOBAL' }) === 'Promo · 15%'
);
ok(
  'discount toggle menyebut status',
  describeActivity('DISCOUNT_TOGGLE', { name: 'Promo', isActive: true }) === 'Promo · diaktifkan'
);
ok('join memakai username', describeActivity('STAFF_JOIN', { username: 'andi', name: 'Andi' }) === '@andi · Andi');

ok('aksi asing ditolak', !isActivityAction('HAPUS') && !isActivityAction(null) && !isActivityAction(7));
ok('semua aksi valid diterima', ACTIVITY_ACTIONS.every((a) => isActivityAction(a)));
ok(
  'filter aksi hanya berisi aksi valid',
  ACTION_FILTERS.every((f) => f.actions.every((a) => isActivityAction(a)))
);

let threwInvalid = false;
try {
  activityRow({
    businessId: 'b1',
    actor: { id: 'u1', name: 'Owner', role: 'OWNER' },
    action: 'HAPUS' as never
  });
} catch {
  threwInvalid = true;
}
ok('activityRow menolak aksi tidak valid', threwInvalid);
const r1 = activityRow({
  businessId: 'b1',
  actor: { id: 'u1', name: 'Owner', role: 'OWNER' },
  action: 'LOGIN',
  meta: { newDevice: false }
});
const r2 = activityRow({
  businessId: 'b1',
  actor: { id: null, name: '-', role: 'STAFF' },
  action: 'TX_CREATE',
  meta: { total: 1, itemCount: 1, qty: 1 }
});
ok('activityRow mengisi id unik', typeof r1.id === 'string' && typeof r2.id === 'string' && r1.id !== r2.id);

console.log(`\n${passCount} passed, ${failCount} failed\n`);
if (failCount > 0) process.exit(1);

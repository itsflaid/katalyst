// E2E diskon: menyerang dev server (BASE_URL, default localhost:5173) + asersi DB langsung.
// Skrip MENULIS data fixture (berawalan E2E-): jalankan hanya di DB dev; exit 1 bila FAIL.
import 'dotenv/config';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
import { calculateCart, type DiscountLike } from '../src/lib/discount';
import { makeTime, DEFAULT_TZ } from '../src/lib/shared/time';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, detail = '') {
  if (cond) { console.log(`  PASS  ${label}`); pass++; }
  else { console.log(`  FAIL  ${label}${detail ? `: ${detail}` : ''}`); fail++; }
}
const raw = (tag: string, status: number, body: string) =>
  console.log(`  [${tag}] status=${status} body=${body.slice(0, 300)}`);

type Sql = ReturnType<typeof postgres>;
let sql: Sql;
let BIZ = '';

async function login(username: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/sign-in/username`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'password' }), redirect: 'manual'
  });
  ok(`login ${username} (${res.status})`, res.status < 400);
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}

async function postForm(cookie: string, route: string, action: string, params: Record<string, string>) {
  const res = await fetch(`${BASE}${route}?/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookie, Origin: BASE, 'x-sveltekit-invalid-data': 'true'
    },
    body: new URLSearchParams(params).toString(),
    redirect: 'manual'
  });
  const text = await res.text();
  return { status: res.status, text };
}

// SvelteKit membalas fetch-POST action SELALU HTTP 200 + JSON {type,status};
// status asli ada di body. Sukses non-JS = 303 redirect.
function isOk(r: { status: number; text: string }) {
  if (r.status === 303) return true;
  try {
    const j = JSON.parse(r.text);
    return j.type === 'success' || j.type === 'redirect';
  } catch { return false; }
}
function isFail(r: { status: number; text: string }, code: number, msg?: RegExp) {
  try {
    const j = JSON.parse(r.text);
    if (j.type !== 'failure' || j.status !== code) return false;
    return msg ? msg.test(JSON.stringify(j)) : true;
  } catch { return false; }
}

const q = async (s: string, ...a: unknown[]) => sql.unsafe(s, a as never[]);
async function one<T>(s: string, ...a: unknown[]): Promise<T> {
  const r = await q(s, ...a);
  return r[0] as T;
}
async function prodByName(name: string) {
  return one<{ id: string; selling_price: number; cost_price: number; stock: number } | undefined>(
    `select id, selling_price, cost_price, stock from product where business_id = $1 and name = $2`, BIZ, name);
}
async function discByName(name: string) {
  return one<{ id: string; quota_used: number } | undefined>(
    `select id, quota_used from discount where business_id = $1 and name = $2`, BIZ, name);
}
async function txCount() {
  const r = await one<{ c: string }>(`select count(*)::text as c from transaction where business_id = $1`, BIZ);
  return Number(r.c);
}
async function latestTx() {
  return one<{ id: string }>(`select id from transaction where business_id = $1 order by created_at desc limit 1`, BIZ);
}

async function main() {
  sql = postgres(process.env.DATABASE_URL!);
  const T = makeTime(DEFAULT_TZ);
  const todayKey = T.dayKey(new Date());
  const tomorrowKey = T.dayKey(T.addDays(new Date(), 1));
  const dayAfterKey = T.dayKey(T.addDays(new Date(), 2));
  const createdTx: string[] = [];

  const owner = await login('owner123');
  const staff = await login('prabowo02');
  BIZ = (await one<{ business_id: string }>(`select business_id from "user" where username = 'owner123'`)).business_id;
  ok('businessId fixture ditemukan', !!BIZ);

  // Fixture produk P (10000/6000/100) + Q (20000/12000/100) via action.
  for (const [nm, sell, cost] of [['E2E-P', 10000, 6000], ['E2E-Q', 20000, 12000]] as const) {
    const r = await postForm(owner, '/products', 'create', {
      name: nm, costPrice: String(cost), sellingPrice: String(sell), stock: '100', minStock: '5', isActive: 'on'
    });
    raw(`mkproduct ${nm}`, r.status, r.text);
  }
  const P = (await prodByName('E2E-P'))!;
  const Q = (await prodByName('E2E-Q'))!;
  ok('fixture P+Q ada stok 100', !!P && !!Q && P.stock === 100 && Q.stock === 100);

  const mkItems = (pid: string, qty: number) => JSON.stringify([{ productId: pid, qty }]);

  try {
    // E1: D1 15% kuota 5 TODAY di P; P×8 total 72500.
    let r = await postForm(owner, '/diskon', 'create', {
      name: 'E2E-D1', scope: 'PRODUCT', productId: P.id, percent: '15', preset: 'TODAY', quota: '5'
    });
    raw('E1 create D1', r.status, r.text);
    ok('E1 create D1 sukses', isOk(r));
    const D1LIKE: DiscountLike = {
      id: 'e2e', name: 'E2E-D1', scope: 'PRODUCT', percent: 15, productId: P.id,
      isActive: true, startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 3600000),
      quota: 5, quotaUsed: 0, createdAt: new Date()
    };
    const exp1 = calculateCart([{ productId: P.id, qty: 8, price: 10000 }],
      { productDiscounts: [D1LIKE], global: null, now: new Date() }).total;
    ok('E1 expectedTotal via calculateCart = 72500', exp1 === 72500, String(exp1));
    r = await postForm(owner, '/transactions', 'create', {
      items: mkItems(P.id, 8), globalDiscountId: '', expectedTotal: String(exp1)
    });
    raw('E1 create P×8', r.status, r.text);
    ok('E1 struk sukses', isOk(r));
    const tx1 = (await latestTx()).id;
    createdTx.push(tx1);
    const it1 = await one<{ discounted_qty: number; discount_amount: number; price_at_sale: number }>(
      `select discounted_qty, discount_amount, price_at_sale from transaction_item where transaction_id = $1`, tx1);
    const D1 = (await discByName('E2E-D1'))!;
    const P1 = (await prodByName('E2E-P'))!;
    ok('E1 item discountedQty 5 amount 7500 price 10000', it1.discounted_qty === 5 && it1.discount_amount === 7500 && it1.price_at_sale === 10000, JSON.stringify(it1));
    ok('E1 D1.used=5 stok P=92', D1.quota_used === 5 && P1.stock === 92, `used=${D1.quota_used} stock=${P1.stock}`);

    // E2: D1 SOLD_OUT; total basi 17000 → 409 PRICE_CHANGED, tanpa tulisan.
    const txBefore = await txCount();
    const stockBefore = (await prodByName('E2E-P'))!.stock;
    r = await postForm(owner, '/transactions', 'create', {
      items: mkItems(P.id, 2), globalDiscountId: '', expectedTotal: '17000'
    });
    raw('E2 stale', r.status, r.text);
    ok('E2 basi → 409 PRICE_CHANGED', isFail(r, 409, /PRICE_CHANGED/), `status=${r.status}`);
    ok('E2 tanpa struk/stok/kuota baru',
      (await txCount()) === txBefore && (await prodByName('E2E-P'))!.stock === stockBefore
      && (await discByName('E2E-D1'))!.quota_used === 5);
    r = await postForm(owner, '/transactions', 'create', {
      items: mkItems(P.id, 2), globalDiscountId: '', expectedTotal: '20000'
    });
    raw('E2 retry', r.status, r.text);
    ok('E2 retry 20000 sukses', isOk(r));
    const tx2 = (await latestTx()).id;
    createdTx.push(tx2);
    const it2 = await one<{ discounted_qty: number; discount_id: string | null }>(
      `select discounted_qty, discount_id from transaction_item where transaction_id = $1`, tx2);
    ok('E2 retry tanpa diskon', it2.discounted_qty === 0 && it2.discount_id === null, JSON.stringify(it2));

    // E3: void E1 lalu void kedua kali (idempoten).
    r = await postForm(owner, '/transactions', 'deleteTx', { txId: tx1 });
    raw('E3 void#1', r.status, r.text);
    ok('E3 void#1 sukses', isOk(r));
    ok('E3 used=0 stok kembali 98',
      (await discByName('E2E-D1'))!.quota_used === 0 && (await prodByName('E2E-P'))!.stock === 98);
    r = await postForm(owner, '/transactions', 'deleteTx', { txId: tx1 });
    raw('E3 void#2', r.status, r.text);
    ok('E3 void#2 tak mengubah (404 + used/stok tetap)',
      isFail(r, 404) && (await discByName('E2E-D1'))!.quota_used === 0 && (await prodByName('E2E-P'))!.stock === 98);

    // E4: race dua create P×3 (25500) saat used 0/kuota 5.
    const mkRace = () => postForm(owner, '/transactions', 'create', {
      items: mkItems(P.id, 3), globalDiscountId: '', expectedTotal: '25500'
    });
    const [a, b] = await Promise.all([mkRace(), mkRace()]);
    raw('E4 race A', a.status, a.text);
    raw('E4 race B', b.status, b.text);
    const okCount = [a, b].filter((x) => isOk(x)).length;
    const failCount = [a, b].filter((x) => isFail(x, 409, /QUOTA_CHANGED|PRICE_CHANGED/)).length;
    ok('E4 tepat satu sukses satu 409', okCount === 1 && failCount === 1, `ok=${okCount} fail=${failCount}`);
    const D1b = (await discByName('E2E-D1'))!;
    const Pb = (await prodByName('E2E-P'))!;
    ok('E4 used=3 stok 95', D1b.quota_used === 3 && Pb.stock === 95, `used=${D1b.quota_used} stock=${Pb.stock}`);
    const txWin = (await latestTx()).id;
    createdTx.push(txWin);

    // D1 dimatikan agar E5/E6 menguji slits murni (tanpa sisa kuota D1).
    r = await postForm(owner, '/diskon', 'toggle', { id: (await discByName('E2E-D1'))!.id });
    ok('D1 off sebelum E5', isOk(r));

    // E5: expired + terjadwal (insert langsung) → 409; normal → sukses.
    const nowMs = Date.now();
    await q(`insert into discount (id, business_id, name, scope, percent, product_id, is_active, starts_at, ends_at, quota_used)
      values ($1,$2,'E2E-EXP','PRODUCT',15,$3,true,$4,$5,0)`,
      randomUUID(), BIZ, P.id, new Date(nowMs - 2 * 3600_000), new Date(nowMs - 3600_000));
    await q(`insert into discount (id, business_id, name, scope, percent, product_id, is_active, starts_at, ends_at, quota_used)
      values ($1,$2,'E2E-SCH','PRODUCT',15,$3,true,$4,$5,0)`,
      randomUUID(), BIZ, P.id, new Date(nowMs + 3600_000), new Date(nowMs + 2 * 3600_000));
    r = await postForm(owner, '/transactions', 'create', {
      items: mkItems(P.id, 1), globalDiscountId: '', expectedTotal: '8500'
    });
    raw('E5 seolah diskon', r.status, r.text);
    ok('E5 expired/sched → 409', isFail(r, 409), `status=${r.status} ${r.text.slice(0, 120)}`);
    r = await postForm(owner, '/transactions', 'create', {
      items: mkItems(P.id, 1), globalDiscountId: '', expectedTotal: '10000'
    });
    raw('E5 normal', r.status, r.text);
    ok('E5 normal sukses tanpa diskon', isOk(r));
    createdTx.push((await latestTx()).id);
    // Fixture E5 dibuang agar tak mengganggu E7/E9 (sudah membuktikan perannya).
    await q(`delete from discount where business_id = $1 and name in ('E2E-EXP','E2E-SCH')`, BIZ);

    // E6: global G 10% TODAY; P×2+Q×1 = 36000.
    r = await postForm(owner, '/diskon', 'create', {
      name: 'E2E-G', scope: 'GLOBAL', percent: '10', preset: 'TODAY'
    });
    raw('E6 create G', r.status, r.text);
    ok('E6 create G sukses', isOk(r));
    const G = (await discByName('E2E-G'))!;
    const items6 = JSON.stringify([{ productId: P.id, qty: 2 }, { productId: Q.id, qty: 1 }]);
    r = await postForm(owner, '/transactions', 'create', {
      items: items6, globalDiscountId: G.id, expectedTotal: '36000'
    });
    raw('E6 cart', r.status, r.text);
    ok('E6 sukses', isOk(r));
    const tx6 = (await latestTx()).id;
    createdTx.push(tx6);
    const rows6 = await q(`select product_id, discount_amount from transaction_item where transaction_id = $1`, tx6) as { product_id: string; discount_amount: number }[];
    const amtP = rows6.find((x) => x.product_id === P.id)?.discount_amount;
    const amtQ = rows6.find((x) => x.product_id === Q.id)?.discount_amount;
    ok('E6 amount P 2000 Q 2000', amtP === 2000 && amtQ === 2000, JSON.stringify(rows6));
    ok('E6 G.used=3', (await discByName('E2E-G'))!.quota_used === 3);

    // E6b: nonaktifkan G → kirim ulang → 409 DISCOUNT_UNAVAILABLE → nyalakan lagi.
    r = await postForm(owner, '/diskon', 'toggle', { id: G.id });
    ok('E6b toggle off sukses', isOk(r));
    r = await postForm(owner, '/transactions', 'create', {
      items: items6, globalDiscountId: G.id, expectedTotal: '36000'
    });
    raw('E6b kirim ulang', r.status, r.text);
    ok('E6b → 409 DISCOUNT_UNAVAILABLE', isFail(r, 409, /DISCOUNT_UNAVAILABLE/));
    r = await postForm(owner, '/diskon', 'toggle', { id: G.id });
    ok('E6b toggle on lagi sukses', isOk(r));

    // E7: D1 sudah off sejak E5 → buat D2 (P 15% kuota 10 TODAY); P×2+Q×1+G = 35000.
    r = await postForm(owner, '/diskon', 'create', {
      name: 'E2E-D2', scope: 'PRODUCT', productId: P.id, percent: '15', preset: 'TODAY', quota: '10'
    });
    raw('E7 create D2', r.status, r.text);
    ok('E7 create D2 sukses', isOk(r));
    r = await postForm(owner, '/transactions', 'create', {
      items: items6, globalDiscountId: G.id, expectedTotal: '35000'
    });
    raw('E7 cart', r.status, r.text);
    ok('E7 sukses', isOk(r));
    const tx7 = (await latestTx()).id;
    createdTx.push(tx7);
    const rows7 = await q(`select product_id, discount_amount from transaction_item where transaction_id = $1`, tx7) as { product_id: string; discount_amount: number }[];
    ok('E7 P 3000 (D2) Q 2000 (G)',
      rows7.find((x) => x.product_id === P.id)?.discount_amount === 3000
      && rows7.find((x) => x.product_id === Q.id)?.discount_amount === 2000, JSON.stringify(rows7));

    // E8: staff dilarang diskon; staff boleh kasir (P×1 → D2: 8500).
    const dcBefore = (await q(`select count(*)::text as c from discount where business_id = $1`, BIZ) as { c: string }[])[0];
    r = await postForm(staff, '/diskon', 'create', { name: 'E2E-HACK', scope: 'GLOBAL', percent: '99', preset: 'TODAY' });
    raw('E8 staff diskon', r.status, r.text);
    const dcAfter = (await q(`select count(*)::text as c from discount where business_id = $1`, BIZ) as { c: string }[])[0];
    ok('E8 staff tak ada baris baru', dcBefore.c === dcAfter.c, `status=${r.status}`);
    r = await postForm(staff, '/transactions', 'create', {
      items: mkItems(P.id, 1), globalDiscountId: '', expectedTotal: '8500'
    });
    raw('E8 staff kasir', r.status, r.text);
    ok('E8 staff kasir sukses', isOk(r));
    createdTx.push((await latestTx()).id);

    // E9: D3 TODAY saat D2 aktif → 400; mulai besok → sukses.
    r = await postForm(owner, '/diskon', 'create', {
      name: 'E2E-D3', scope: 'PRODUCT', productId: P.id, percent: '5', preset: 'TODAY'
    });
    raw('E9 overlap', r.status, r.text);
    ok('E9 overlap → 400 bertabrakan', isFail(r, 400, /bertabrakan/));
    r = await postForm(owner, '/diskon', 'create', {
      name: 'E2E-D3', scope: 'PRODUCT', productId: P.id, percent: '5', preset: 'CUSTOM', startDay: tomorrowKey, endDay: dayAfterKey
    });
    raw('E9 besok', r.status, r.text);
    ok('E9 mulai besok sukses', isOk(r));

    // E10: global tanpa akhir / dengan kuota → 400.
    r = await postForm(owner, '/diskon', 'create', { name: 'E2E-GX1', scope: 'GLOBAL', percent: '5', preset: 'OPEN' });
    ok('E10 global OPEN → 400', isFail(r, 400), `status=${r.status}`);
    r = await postForm(owner, '/diskon', 'create', { name: 'E2E-GX2', scope: 'GLOBAL', percent: '5', preset: 'TODAY', quota: '5' });
    ok('E10 global kuota → 400', isFail(r, 400), `status=${r.status}`);

    // E11: 50% di Q (modal 12000) tanpa confirm → 400 BELOW_COST; dengan → sukses.
    r = await postForm(owner, '/diskon', 'create', {
      name: 'E2E-DQ', scope: 'PRODUCT', productId: Q.id, percent: '50', preset: 'TODAY'
    });
    raw('E11 tanpa confirm', r.status, r.text);
    ok('E11 → 400 BELOW_COST', isFail(r, 400, /BELOW_COST/));
    r = await postForm(owner, '/diskon', 'create', {
      name: 'E2E-DQ', scope: 'PRODUCT', productId: Q.id, percent: '50', preset: 'TODAY', confirmLoss: 'on'
    });
    raw('E11 confirm', r.status, r.text);
    ok('E11 confirm → sukses', isOk(r));

    // E12: edit kuota D2 di bawah terpakai (2) → 400.
    const D2 = (await discByName('E2E-D2'))!;
    r = await postForm(owner, '/diskon', 'update', {
      id: D2.id, name: 'E2E-D2', scope: 'PRODUCT', productId: P.id, percent: '15', preset: 'TODAY', quota: '1'
    });
    raw('E12 quota 1', r.status, r.text);
    ok('E12 → 400', isFail(r, 400), `status=${r.status}`);

    // E13: tanpa expectedTotal → 400.
    r = await postForm(owner, '/transactions', 'create', { items: mkItems(P.id, 1), globalDiscountId: '' });
    raw('E13 tanpa total', r.status, r.text);
    ok('E13 → 400', isFail(r, 400));

    // E14: __data.json staff tanpa costPrice.
    console.log(`  (hari ini=${todayKey})`);
    const dj = await (await fetch(`${BASE}/transactions/__data.json`, { headers: { Cookie: staff } })).text();
    ok('E14 tanpa costPrice', !dj.includes('costPrice'), `len=${dj.length}`);
  } finally {
    // Bersih-bersih urutan FK; bila gagal → nonaktifkan + laporkan.
    try {
      if (createdTx.length > 0) {
        await q(`delete from transaction_item where transaction_id = any($1)`, createdTx);
        await q(`delete from transaction where id = any($1)`, createdTx);
      }
      const pids = (await q(`select id from product where business_id = $1 and name like 'E2E-%'`, BIZ) as { id: string }[]).map((r) => r.id);
      if (pids.length > 0) {
        await q(`delete from stock_movement where product_id = any($1)`, pids);
      }
      await q(`delete from discount where business_id = $1 and name like 'E2E-%'`, BIZ);
      await q(`delete from product where business_id = $1 and name like 'E2E-%'`, BIZ);
      const left = await q(`select count(*)::text as c from product where business_id = $1 and name like 'E2E-%'`, BIZ) as { c: string }[];
      ok(`bersih (sisa fixture ${left[0].c})`, left[0].c === '0', JSON.stringify(left));
    } catch (e) {
      try {
        await q(`update discount set is_active = false where business_id = $1 and name like 'E2E-%'`, BIZ);
        await q(`update product set is_active = false where business_id = $1 and name like 'E2E-%'`, BIZ);
      } catch { /* abaikan */ }
      ok('bersih (fallback nonaktif)', false, String(e).slice(0, 200));
    }
    await sql.end();
  }
  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}
main();

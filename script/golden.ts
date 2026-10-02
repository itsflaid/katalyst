// Golden snapshot halaman (butuh dev server + DB demo ter-seed).
// Rekam: `tsx script/golden.ts record` · Banding: `tsx script/golden.ts check`.
// Rekam & banding di sesi yang sama; jangan bersamaan dengan e2e-discount (menulis data).
import 'dotenv/config';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { unflatten } from 'devalue';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const DIR = join(process.cwd(), '.golden');
const MODE = process.argv[2] ?? 'check';

// Rentang custom eksplisit (from DAN to selalu diisi) supaya tak bergantung now.
const ROUTES = [
  '/dashboard',
  '/statistik?range=custom&from=2026-08-02&to=2026-08-31',
  '/statistik?range=custom&from=2026-08-25&to=2026-08-31',
  '/statistik?range=custom&from=2026-01-01&to=2026-01-31',
  '/simulator?range=all',
  '/simulator?range=custom&from=2026-08-02&to=2026-08-31',
  '/transactions'
];

function slug(route: string): string {
  return route
    .replace(/^\//, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^$/, 'root')
    .slice(0, 120);
}

// Urutkan kunci rekursif biar perbandingan stabil.
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) {
      if (k === 'serverNow') continue; // berubah tiap detik
      out[k] = sortKeys(o[k]);
    }
    return out;
  }
  return v;
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/sign-in/username`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner123', password: 'password' }),
    redirect: 'manual'
  });
  if (res.status >= 400) throw new Error(`login gagal status=${res.status}`);
  const cookies: string[] = res.headers.getSetCookie?.() ?? [];
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

// Bentuk URL data SvelteKit: <path>/__data.json?<search>&x-sveltekit-invalidated=01
function dataUrls(route: string): string[] {
  const [path, search] = route.split('?');
  const q = search ? `${search}&x-sveltekit-invalidated=01` : 'x-sveltekit-invalidated=01';
  return [`${BASE}${path}/__data.json?${q}`, `${BASE}${path}/__data.json`];
}

async function fetchRoute(cookie: string, route: string): Promise<{ normalized: unknown; fallback: boolean }> {
  let lastText = '';
  for (const url of dataUrls(route)) {
    const res = await fetch(url, { headers: { Cookie: cookie } });
    lastText = await res.text();
    if (!res.ok) continue;
    try {
      const j = JSON.parse(lastText);
      const nodes = j?.nodes ?? j?.data?.nodes;
      if (Array.isArray(nodes)) {
        const datas = nodes.map((n: { data?: unknown }) => (n && 'data' in n ? unflatten(n.data as never) : null));
        return { normalized: sortKeys(datas), fallback: false };
      }
    } catch {
      // lanjut ke fallback di bawah
    }
  }
  console.log(`  [fallback-teks] ${route} (format __data.json tak dikenali, banding teks mentah)`);
  return { normalized: sortKeys({ __raw: lastText }), fallback: true };
}

// Urutan matrix.points mengikuti GROUP BY SQL tanpa ORDER BY sehingga tak
// stabil antar-query (nilai sama, urutan beda). Scatter chart tak peduli
// urutan → bandingkan sebagai himpunan (urut by href).
function stabilizePoints(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(stabilizePoints);
  if (data && typeof data === 'object' && !(data instanceof Date)) {
    const o = data as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      const sv = stabilizePoints(v);
      out[k] =
        k === 'points' &&
        Array.isArray(sv) &&
        sv.every((e) => typeof (e as Record<string, unknown>)?.href === 'string')
          ? [...sv].sort((a, b) =>
              String((a as Record<string, unknown>).href).localeCompare(String((b as Record<string, unknown>).href))
            )
          : sv;
    }
    return out;
  }
  return data;
}

async function collect(cookie: string): Promise<{ route: string; data: unknown }[]> {
  const out: { route: string; data: unknown }[] = [];
  for (const r of ROUTES) {
    const { normalized } = await fetchRoute(cookie, r);
    const stabilized = stabilizePoints(normalized);
    out.push({ route: r, data: r.startsWith('/simulator') ? simulatorSubset(stabilized, r) : stabilized });
  }
  // Ambil 2 id produk dari array `products` data simulator untuk rute /products/<id>.
  // (Diambil dari fetch mentah agar tak tergantung bentuk subset.)
  try {
    const { normalized } = await fetchRoute(cookie, '/simulator?range=all');
    const sim = { data: normalized };
    const ids: string[] = [];
    const scan = (v: unknown) => {
      if (ids.length >= 2) return;
      if (Array.isArray(v)) return v.forEach(scan);
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        const prods = o.products;
        if (Array.isArray(prods)) {
          for (const p of prods) {
            if (ids.length >= 2) break;
            const id = (p as Record<string, unknown>)?.id;
            if (typeof id === 'string') ids.push(id);
          }
          return;
        }
        Object.values(o).forEach(scan);
      }
    };
    scan(sim?.data);
    for (const id of ids.slice(0, 2)) {
      const route = `/products/${id}`;
      const { normalized } = await fetchRoute(cookie, route);
      out.push({ route, data: stabilizePoints(normalized) });
    }
  } catch (e) {
    console.log(`  [produk-skip] ${String(e).slice(0, 120)}`);
  }
  return out;
}

// Baselines simulator memuat `facts`; rute /simulator dibandingkan hanya
// subset field per produk (productId, qty, revenue, cost, profit, margin,
// txCount) + label rentang. Snapshot tanpa facts tetap cocok.
function simulatorSubset(data: unknown, route: string): unknown {
  const pick = (b: Record<string, unknown>) => ({
    productId: b.productId,
    qty: b.qty,
    revenue: b.revenue,
    cost: b.cost,
    profit: b.profit,
    margin: b.margin,
    txCount: b.txCount
  });
  const found: unknown[] = [];
  const scan = (v: unknown): void => {
    if (Array.isArray(v)) {
      v.forEach(scan);
      return;
    }
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (Array.isArray(o.baselines)) {
        found.push({
          baselines: (o.baselines as Record<string, unknown>[]).map(pick),
          range: o.range,
          rangeLabel: o.rangeLabel,
          rangeFrom: o.rangeFrom,
          rangeTo: o.rangeTo,
          productCount: Array.isArray(o.products) ? o.products.length : null
        });
        return;
      }
      Object.values(o).forEach(scan);
    }
  };
  scan(data);
  if (found.length === 0) console.log(`  [subset-kosong] ${route} (baselines tak ditemukan, banding penuh)`);
  return found.length > 0 ? sortKeys(found) : sortKeys(data);
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  const cookie = await login();
  const rows = await collect(cookie);
  if (MODE === 'record') {
    for (const r of rows) {
      writeFileSync(join(DIR, `${slug(r.route)}.json`), JSON.stringify({ route: r.route, data: r.data }, null, 2));
    }
    console.log(`record: ${rows.length} rute → .golden/`);
    return;
  }
  // Mode check
  let diff = 0;
  const names = existsSync(DIR) ? readdirSync(DIR) : [];
  if (names.length === 0) throw new Error('.golden/ kosong — jalankan golden:record dulu.');
  for (const r of rows) {
    const f = join(DIR, `${slug(r.route)}.json`);
    if (!existsSync(f)) {
      console.log(`DIFF (baru): ${r.route} — tak ada snapshot`);
      diff++;
      continue;
    }
    const saved = JSON.parse(readFileSync(f, 'utf8'));
    const savedStabilized = stabilizePoints(saved.data);
    const savedData = r.route.startsWith('/simulator') ? simulatorSubset(savedStabilized, r.route) : savedStabilized;
    const a = JSON.stringify(savedData);
    const b = JSON.stringify(r.data);
    if (a !== b) {
      console.log(`DIFF: ${r.route} (tersimpan ${a.length} chr vs kini ${b.length} chr)`);
      diff++;
    } else {
      console.log(`SAMA: ${r.route}`);
    }
  }
  console.log(`\n${diff} diff dari ${rows.length} rute`);
  if (diff > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

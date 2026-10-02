// Pakai: node scripts/lock-optionals.cjs          (dry-run, hanya laporan)
//        node scripts/lock-optionals.cjs --apply  (tulis ke package-lock.json)
const fs = require('fs');
const semver = require('semver');
const APPLY = process.argv.includes('--apply');
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const pk = lock.packages;
const ALLOWED = /^(@esbuild\/|@cloudflare\/workerd-|@rollup\/rollup-)/;

// lokasi kandidat entri `dep` untuk paket di P: nested diutamakan, lalu naik (sibling, dst.)
function candidates(P, dep) {
  const out = [`${P}/node_modules/${dep}`];
  let p = P;
  while (p) {
    const i = p.lastIndexOf('node_modules/');
    if (i === -1) { out.push(`node_modules/${dep}`); break; }
    out.push(`${p.slice(0, i + 12)}/${dep}`);
    p = p.slice(0, i).replace(/\/$/, '');
  }
  return out;
}

async function meta(dep, v) {
  const r = await fetch(`https://registry.npmjs.org/${dep.replace('/', '%2f')}/${v}`);
  if (!r.ok) throw new Error(`${dep}@${v}: HTTP ${r.status}`);
  return r.json();
}

(async () => {
  const added = {}, skipped = [];
  for (const [P, e] of Object.entries(pk)) {
    if (!P || !e.optionalDependencies) continue;
    for (const [dep, range] of Object.entries(e.optionalDependencies)) {
      const c = candidates(P, dep);
      const hit = c.find((k) => pk[k] || added[k]);
      if (hit && semver.satisfies((pk[hit] || added[hit]).version, range)) continue;
      const target = hit ? c[0] : c[1];
      if (pk[target] || added[target]) { skipped.push(`${target} (bentrok)`); continue; }
      if (!semver.valid(range)) { skipped.push(`${dep}@${range} di ${P} (bukan versi eksak)`); continue; }
      if (!ALLOWED.test(dep)) { skipped.push(`${dep}@${range} di ${P} (di luar daftar)`); continue; }
      const m = await meta(dep, range);
      const x = { version: m.version, resolved: m.dist.tarball, integrity: m.dist.integrity, cpu: m.cpu };
      if (e.dev) x.dev = true;
      x.libc = m.libc; x.optional = true; x.os = m.os; x.engines = m.engines;
      added[target] = x;
    }
  }
  const keys = Object.keys(added);
  console.log(`Akan ditambah: ${keys.length}`);
  keys.forEach((k) => console.log('  +', k, added[k].version));
  if (skipped.length) { console.log('Dilewati:'); skipped.forEach((s) => console.log('  -', s)); }
  if (!APPLY) return console.log('\nDry-run. Tambahkan --apply untuk menulis.');
  Object.assign(pk, added);
  lock.packages = Object.fromEntries(
    Object.entries(pk).sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'en')))
  );
  fs.writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
  console.log('package-lock.json ditulis.');
})().catch((e) => { console.error(e); process.exit(1); });

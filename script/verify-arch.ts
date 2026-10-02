// Aturan lapis R1-R4 (§2): baca file, tanpa DB.
// Mode laporan (PR0-PR6): cetak pelanggaran, exit 0.
// Mode tegak (PR7): `tsx script/verify-arch.ts --enforce` → exit 1 bila ada pelanggaran.
// Mekanisme pengecualian per baris: `// arch-allow: <alasan>`.
// `src/routes/copilot/**` dikecualikan dari semua aturan (di luar scope refactor).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const ENFORCE = process.argv.includes('--enforce');

interface Violation {
  file: string;
  line: number;
  rule: string;
  snippet: string;
}

const violations: Violation[] = [];

// Kumpulkan file sumber (ts/svelte/js), lewati copilot.
function collect(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (p.replace(/\\/g, '/').includes('src/routes/copilot')) continue;
      collect(p, out);
    } else if (/\.(ts|svelte|js)$/.test(e)) {
      if (p.replace(/\\/g, '/').includes('src/routes/copilot')) continue;
      out.push(p);
    }
  }
  return out;
}

function posix(p: string): string {
  return relative(ROOT, p).replace(/\\/g, '/');
}

function hasAllow(line: string): boolean {
  return line.includes('arch-allow:');
}

// ---------- R1 ----------
const R1_ALLOW = [
  'src/lib/server/db/schema.ts',
  'src/lib/server/db/seed-', // prefix (seed-demo.ts, seed-real.ts, dst.)
  'src/lib/server/domains/facts/',
  'src/lib/analytics/',
  'src/lib/simulation.ts',
  'src/lib/server/sql.ts',
  'src/routes/transactions/',
  // Jalur tulis snapshot (calculateCart/quotaDeltas): satu-satunya tempat
  // diskon dihitung dari persen selain simulasi (§3). Penyimpangan sadar
  // dari daftar §2 — tanpa ini 8 baris penulis tak bisa dihapus.
  'src/lib/discount.ts',
  // Daftar boleh-lewat sementara — dihapus di PR yang memigrasikannya:
  'src/routes/products/[id]/+page.server.ts',
  'src/lib/server/domains/stats/loaders.ts'
];
const R1_RE = /\b(priceAtSale|costAtSale|discountAmount|discountedQty|lineNet)\b/;

function r1Allowed(file: string): boolean {
  return R1_ALLOW.some((a) => file === a || file.startsWith(a));
}

// ---------- R2 ----------
const R2_PATTERNS: { re: RegExp; name: string }[] = [
  // `profit` wajib TIDAK didahului `.` (member access): biar komparator
  // sort `a.profit : b.margin - a.margin` (ternary) tak ditangkap, tapi
  // `const profit = revenue - cost` / `profit: v.revenue - v.cost` tetap kena.
  { re: /(^|[^\w.])profit\s*[:=]\s*[\w.]+\s*-\s*[\w.]+/, name: 'profit=a-b' },
  { re: /\b(rev|revenue)\s*-\s*(cost|v\.cost)\b/, name: 'rev-cost' },
  { re: /\bprofit\s*\/\s*(rev|revenue)\b/, name: 'profit/rev' },
  { re: /\bsim(Rev|Cost|Profit|Margin)\b/, name: 'simXxx' }
];

function r2Scope(file: string): boolean {
  return file.startsWith('src/routes/') || file.endsWith('domains/stats/loaders.ts');
}

// ---------- R3 ----------
const R3_SCOPE = ['src/lib/analytics/', 'src/lib/simulation.ts', 'src/lib/shared/', 'src/lib/discount.ts'];
const R3_IMPORT_RE = /\b(import|from|require\()\b.*?(server|\$env|\$app|drizzle-orm|postgres|@neondatabase)/;
const R3_LIB_RE = /from\s+['"]\$lib\//;

function r3Scope(file: string): boolean {
  return R3_SCOPE.some((s) => file === s || file.startsWith(s));
}

// ---------- R4 ----------
function r4Scope(file: string): boolean {
  return (
    file.startsWith('src/lib/analytics/') ||
    file === 'src/lib/simulation.ts' ||
    file === 'src/lib/shared/period.ts'
  );
}
// R4: yang dilarang BACAAAN JAM (konstruksi kosong / Date.now), bukan
// konstruksi deterministik new Date(x) dari komponen kalender (dipakai
// sah di shared/period.ts untuk tgl 1 dan previousWindow).
const R4_RES = [/\bnew\s+Date\s*\(\s*\)/, /\bDate\s*\.\s*now\s*\(/];

function main() {
  const files = collect(SRC);
  for (const abs of files) {
    const file = posix(abs);
    const text = readFileSync(abs, 'utf8');
    const lines = text.split('\n');
    lines.forEach((raw, i) => {
      const lineNo = i + 1;
      if (hasAllow(raw)) return;
      // R1
      if (!r1Allowed(file) && R1_RE.test(raw)) {
        violations.push({ file, line: lineNo, rule: 'R1', snippet: raw.trim().slice(0, 120) });
      }
      // R2
      if (r2Scope(file)) {
        // Baris komentar murni dilewati (rumus di komentar tak dieksekusi).
        const t = raw.trim();
        const isComment = t.startsWith('//') || t.startsWith('*') || t.startsWith('<!--');
        if (!isComment) {
          for (const p of R2_PATTERNS) {
            if (p.re.test(raw)) {
              violations.push({ file, line: lineNo, rule: `R2:${p.name}`, snippet: raw.trim().slice(0, 120) });
              break;
            }
          }
        }
      }
      // R3
      if (r3Scope(file)) {
        if (R3_IMPORT_RE.test(raw)) {
          violations.push({ file, line: lineNo, rule: 'R3:import', snippet: raw.trim().slice(0, 120) });
        } else if (R3_LIB_RE.test(raw)) {
          violations.push({ file, line: lineNo, rule: 'R3:$lib', snippet: raw.trim().slice(0, 120) });
        }
      }
      // R4
      if (r4Scope(file)) {
        if (R4_RES.some((re) => re.test(raw))) {
          violations.push({ file, line: lineNo, rule: 'R4:now', snippet: raw.trim().slice(0, 120) });
        }
      }
    });
  }

  for (const v of violations) {
    console.log(`${v.file}:${v.line} [${v.rule}] ${v.snippet}`);
  }
  const byRule = new Map<string, number>();
  for (const v of violations) byRule.set(v.rule, (byRule.get(v.rule) ?? 0) + 1);
  console.log(`\n${violations.length} pelanggaran (${[...byRule.entries()].map(([k, n]) => `${k}=${n}`).join(', ') || 'bersih'})`);
  if (ENFORCE && violations.length > 0) process.exit(1);
}

main();

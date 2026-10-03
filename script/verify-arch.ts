// Aturan lapis R1-R5 (baca file, tanpa DB); R5 juga memindai script/*.ts.
// Mode laporan: cetak pelanggaran, exit 0; --enforce: exit 1 bila ada pelanggaran.
// Pengecualian per baris: `// arch-allow: <alasan>`. `src/routes/copilot/**` di luar scope.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const SCRIPT = join(ROOT, 'script');
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

const R1_ALLOW = [
  'src/lib/server/db/schema.ts',
  'src/lib/server/db/seed-', // prefix (seed-demo.ts, seed-real.ts, dst.)
  'src/lib/server/domains/facts/',
  'src/lib/analytics/',
  'src/lib/simulation.ts',
  'src/lib/server/sql.ts',
  'src/routes/transactions/',
  // Jalur tulis snapshot (calculateCart, quotaDeltas): satu-satunya tempat
  // diskon dihitung dari persen selain simulasi; tanpanya baris penulis tak bisa dihapus.
  'src/lib/discount.ts',
  // Pembaca item per baris yang sah, seperti routes/transactions/.
  'src/lib/server/domains/transactions/'
];
const R1_RE = /\b(priceAtSale|costAtSale|discountAmount|discountedQty|lineNet)\b/;

function r1Allowed(file: string): boolean {
  return R1_ALLOW.some((a) => file === a || file.startsWith(a));
}

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

const R3_SCOPE = ['src/lib/analytics/', 'src/lib/simulation.ts', 'src/lib/shared/', 'src/lib/discount.ts'];
const R3_IMPORT_RE = /\b(import|from|require\()\b.*?(server|\$env|\$app|drizzle-orm|postgres|@neondatabase)/;
const R3_LIB_RE = /from\s+['"]\$lib\//;

function r3Scope(file: string): boolean {
  return R3_SCOPE.some((s) => file === s || file.startsWith(s));
}

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

const R5_BANNER_RE = /^[-=─━*#~_+]{4,}\s*$|^[-=─━*#~_+]{2,}\s*\S.*\S\s*[-=─━*#~_+]{2,}$/;
const R5_DOC_REF_RE = /§\s*\d|\bSPEC\b|\bFase\s*\d|\bPR\s?-?[A-Z]?\d|\bTahap\s*\d/;
const R5_HISTORY_RE = /\b(dulu|dahulu|kini|pengganti|menggantikan|hasil refactor|tidak lagi|sudah tidak|semula|awalnya|versi lama|legacy)\b/;
const R5_RUMUS_LABEL_RE = /^Rumus\s+/i;
const R5_TODO_NAKED_RE = /\b(TODO|FIXME|XXX|HACK)\b/;
const R5_EMOJI_RE = /\p{Extended_Pictographic}/u;
const R5_FORMULA_LINE_RE = /^\s*[^=]+?\s*=\s*.+/;

function extractCommentText(line: string): string | null {
  const t = line.trim();
  if (t.startsWith('//')) return t.slice(2).trim();
  if (t.startsWith('/*') || t.startsWith('*')) return t.replace(/^\/?\*+\/?|\*+\/$/g, '').trim();
  if (t.startsWith('<!--')) return t.replace(/^<!--\s*|\s*-->$/g, '').trim();
  return null;
}

function isDirective(text: string): boolean {
  return /@ts-(?:expect-error|ignore|nocheck|check)|eslint-(?:disable|enable)|svelte-ignore|prettier-ignore|\/\/\/\s*<reference|@vite-ignore/.test(text);
}

function r5Check(file: string, lines: string[]) {
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    if (hasAllow(raw)) continue;

    const commentText = extractCommentText(raw);
    if (!commentText) continue;
    if (isDirective(commentText)) continue;

    if (R5_BANNER_RE.test(commentText)) {
      violations.push({ file, line: lineNo, rule: 'R5a:banner', snippet: raw.trim().slice(0, 80) });
    }
    if (R5_DOC_REF_RE.test(commentText)) {
      violations.push({ file, line: lineNo, rule: 'R5b:docref', snippet: raw.trim().slice(0, 80) });
    }
    if (R5_HISTORY_RE.test(commentText)) {
      violations.push({ file, line: lineNo, rule: 'R5c:history', snippet: raw.trim().slice(0, 80) });
    }
    if (R5_RUMUS_LABEL_RE.test(commentText)) {
      violations.push({ file, line: lineNo, rule: 'R5d:rumus-label', snippet: raw.trim().slice(0, 80) });
    }
    if (R5_TODO_NAKED_RE.test(commentText) && !/TODO\([^)]+\):/.test(commentText)) {
      violations.push({ file, line: lineNo, rule: 'R5f:todo-naked', snippet: raw.trim().slice(0, 80) });
    }
    if (R5_EMOJI_RE.test(commentText)) {
      violations.push({ file, line: lineNo, rule: 'R5g:emoji', snippet: raw.trim().slice(0, 80) });
    }
  }

  let currentBlock: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const commentText = extractCommentText(lines[i]);
    if (commentText && !isDirective(commentText)) {
      currentBlock.push(commentText);
    } else {
      if (currentBlock.length > 3) {
        const allFormula = currentBlock.every(c => R5_FORMULA_LINE_RE.test(c));
        if (!allFormula) {
          violations.push({ file, line: i - currentBlock.length + 1, rule: 'R5e:long-block', snippet: `${currentBlock.length} baris` });
        }
      }
      currentBlock = [];
    }
  }
  if (currentBlock.length > 3) {
    const allFormula = currentBlock.every(c => R5_FORMULA_LINE_RE.test(c));
    if (!allFormula) {
      violations.push({ file, line: lines.length - currentBlock.length + 1, rule: 'R5e:long-block', snippet: `${currentBlock.length} baris` });
    }
  }
}

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
    
    // R5
    r5Check(file, lines);
  }

  // R5 juga berlaku untuk file alat (script/*.ts); R1-R4 hanya untuk src.
  for (const abs of collect(SCRIPT)) {
    const file = posix(abs);
    r5Check(file, readFileSync(abs, 'utf8').split('\n'));
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

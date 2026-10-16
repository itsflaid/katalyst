// Guard scratch lewat proses anak dengan env palsu (murni, tanpa DB); exit 1 bila ada FAIL.
import { spawnSync } from 'node:child_process';

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

const RUN = `import { assertScratchDb } from './src/lib/server/db/scratch-guard.ts'; assertScratchDb();`;
const PASSWORD = 'R4HASIA-PALSU-9z';
const HOST = 'scratch.invalid';
const URL = `postgresql://u:${PASSWORD}@${HOST}:5432/db`;

function runGuard(env: Record<string, string>): { status: number | null; out: string } {
  // Langsung ke CLI tsx via node (tanpa npx/shell) agar argumen -e utuh di semua OS.
  const r = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', '-e', RUN], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: '', ALLOW_DESTRUCTIVE_DB: '', SCRATCH_DB_HOST: '', ...env },
    encoding: 'utf8'
  });
  return { status: r.status, out: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
}

const empty = runGuard({});
ok('env kosong → exit 1', empty.status === 1, `status=${empty.status}`);

const noAllow = runGuard({ DATABASE_URL: URL, SCRATCH_DB_HOST: HOST });
ok('tanpa ALLOW → exit 1', noAllow.status === 1, `status=${noAllow.status}`);

const mismatch = runGuard({ DATABASE_URL: URL, ALLOW_DESTRUCTIVE_DB: '1', SCRATCH_DB_HOST: 'lain.invalid' });
ok('hostname beda → exit 1', mismatch.status === 1, `status=${mismatch.status}`);

const match = runGuard({ DATABASE_URL: URL, ALLOW_DESTRUCTIVE_DB: '1', SCRATCH_DB_HOST: HOST });
ok('hostname cocok → exit 0', match.status === 0, `status=${match.status} ${match.out.slice(0, 120)}`);
ok('output hostname saja', match.out.includes(HOST));
ok('output tanpa password', !match.out.includes(PASSWORD));

console.log(`\n${passCount} passed, ${failCount} failed`);
if (failCount > 0) process.exit(1);

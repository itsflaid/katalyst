// Formatter delta/poin simulator (murni, tanpa DB); exit 1 bila ada FAIL.
import { fmtDeltaPct, fmtPoin } from '../src/lib/shared/format';

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

ok('fmtDeltaPct(null)', fmtDeltaPct(null) === 'dari nol');
ok('fmtDeltaPct(0.125)', fmtDeltaPct(0.125) === '+12.5%');
ok('fmtDeltaPct(-0.02)', fmtDeltaPct(-0.02) === '-2.0%');
ok('fmtPoin(0.006)', fmtPoin(0.006) === '+0.6 pp');
ok('fmtPoin(-0.012)', fmtPoin(-0.012) === '-1.2 pp');

console.log(`\n${passCount} passed, ${failCount} failed`);
if (failCount > 0) process.exit(1);

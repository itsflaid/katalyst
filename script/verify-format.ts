// Formatter uang/bulat/persen/delta di shared/format (murni, tanpa DB); exit 1 bila ada FAIL.
import { fmtDelta, fmtInt, fmtPercent, fmtRupiah, fmtDeltaPct, fmtPoin } from '../src/lib/shared/format';

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
ok('fmtRupiah(1000)', fmtRupiah(1000) === 'Rp1.000');
ok('fmtRupiah(-1500)', fmtRupiah(-1500) === '-Rp1.500');
ok('fmtRupiah(0)', fmtRupiah(0) === 'Rp0');
ok('fmtInt(1234567)', fmtInt(1234567) === '1.234.567');
ok('fmtInt(-1500)', fmtInt(-1500) === '-1.500');
ok('fmtPercent(0.153)', fmtPercent(0.153) === '15,3%');
ok('fmtPercent(0)', fmtPercent(0) === '0,0%');
ok('fmtDelta(null)', fmtDelta(null) === 'baru');
ok('fmtDelta(0.153)', fmtDelta(0.153) === '+15,3%');
ok('fmtDelta(-0.02)', fmtDelta(-0.02) === '-2,0%');

console.log(`\n${passCount} passed, ${failCount} failed`);
if (failCount > 0) process.exit(1);

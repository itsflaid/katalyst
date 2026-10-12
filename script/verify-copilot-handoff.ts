// Verifikasi handoff pertanyaan ke Copilot (murni, tanpa DB).
// Pola skrip lain: PASS/FAIL per kasus + ringkasan, exit 1 bila gagal.
import { COPILOT_HANDOFF_MAX, handoffUrl, parseHandoffQuestion } from '../src/lib/shared/copilot-handoff';

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

console.log('copilot-handoff:');
ok('tanpa query jadi null', parseHandoffQuestion('') === null);
ok('tanpa q jadi null', parseHandoffQuestion('?page=2') === null);
ok('q kosong jadi null', parseHandoffQuestion('?q=') === null);
ok('q spasi saja jadi null', parseHandoffQuestion('?q=%20%20') === null);
ok('q biasa terbaca', parseHandoffQuestion('?q=halo%20dunia') === 'halo dunia');
ok('tambah jadi spasi', parseHandoffQuestion('?q=a+b') === 'a b');
const long = 'x'.repeat(900);
const parsed = parseHandoffQuestion('?q=' + long);
ok('900 karakter dipotong 800', parsed !== null && parsed.length === COPILOT_HANDOFF_MAX);
ok('url meng-encode ?', handoffUrl('omzet?') === '/copilot?q=omzet%3F');
const back = parseHandoffQuestion(handoffUrl('omzet?').slice('/copilot'.length));
ok('url bisa dibaca balik', back === 'omzet?');
ok('url memangkas spasi tepi', handoffUrl('  halo  ') === '/copilot?q=halo');

console.log(`\n${passCount} passed, ${failCount} failed`);
if (failCount > 0) process.exit(1);

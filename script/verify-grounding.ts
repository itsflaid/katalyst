import { verifyGrounding } from '../src/lib/server/domains/copilot/grounding';

let failed = 0;
function ok(label: string, pass: boolean) {
  console.log(`  ${pass ? '\x1b[32mPASS' : '\x1b[31mFAIL'}\x1b[0m  ${label}`);
  if (!pass) failed++;
}

const results = [{ data: { revenue: 125000, revenueText: 'Rp125.000', margin: 0.2, marginText: '20,0%' } }];
ok('angka hasil tool diterima', verifyGrounding('Omzet Rp125.000 dengan margin 20,0%.', results).ok);
ok('angka baru ditolak', !verifyGrounding('Omzet Rp999.999.', results).ok);
ok('token utuh diperiksa', !verifyGrounding('Margin 120,0%.', [{ data: { marginText: '20,0%' } }]).ok);
ok('teks tanpa angka diterima', verifyGrounding('Data belum tersedia.', []).ok);
if (failed) process.exit(1);

import { verifyGrounding } from '../src/lib/server/domains/copilot/grounding';
import { buildSummaryData } from '../src/lib/server/domains/copilot/tools/summary';
import { buildComparePeriodsData } from '../src/lib/server/domains/copilot/tools/compare-periods';

let failed = 0;
function ok(label: string, pass: boolean) {
  console.log(`  ${pass ? '\x1b[32mPASS' : '\x1b[31mFAIL'}\x1b[0m  ${label}`);
  if (!pass) failed++;
}

const kecil = buildSummaryData({
  facts: { qty: 10, gross: 125000, discount: 0, cost: 100000, discountedQty: 0 },
  txCount: 5,
  empty: false,
  period: 'last_30d',
  windowLabel: '30 hari terakhir'
});
ok('angka hasil tool diterima', verifyGrounding('Omzet Rp125.000 dengan margin 20,0%.', [kecil]).ok);
ok('angka baru ditolak', !verifyGrounding('Omzet Rp999.999.', [kecil]).ok);
ok('token utuh diperiksa', !verifyGrounding('Margin 120,0%.', [kecil]).ok);
ok('titik penutup kalimat tidak ikut token', verifyGrounding('Omzet Rp125.000.', [kecil]).ok);
ok('teks tanpa angka diterima', verifyGrounding('Data belum tersedia.', []).ok);

const naik = buildComparePeriodsData({
  current: { qty: 341, gross: 3409000, discount: 0, cost: 0, discountedQty: 0 },
  baseline: { qty: 146, gross: 1461000, discount: 0, cost: 0, discountedQty: 0 },
  empty: false,
  period: 'last_30d',
  windowLabel: '30 hari terakhir',
  baselineLabel: '30 hari sebelumnya'
});
ok('tanda depan diabaikan', verifyGrounding('Naik 133,3% menjadi Rp3.409.000.', [naik]).ok);
ok('minus boleh ditulis tanpa tanda', verifyGrounding('Turun Rp420.000.', [{ deltaText: '-Rp420.000' }]).ok);
ok('poin diverifikasi', verifyGrounding('Margin naik 2,1 poin.', [{ pointsText: '+2,1 poin' }]).ok);
ok('poin karangan ditolak', !verifyGrounding('Margin naik 9,9 poin.', [{ pointsText: '+2,1 poin' }]).ok);

const ringkas = buildSummaryData({
  facts: { qty: 775, gross: 70000000, discount: 3028000, cost: 46872000, discountedQty: 0 },
  txCount: 775,
  empty: false,
  period: 'last_30d',
  windowLabel: '30 hari terakhir'
});
ok('satuan diverifikasi', verifyGrounding('Terjual 775 struk.', [ringkas]).ok);
ok(
  'jawaban ringkas 30 hari diterima',
  verifyGrounding('Omzet 30 hari terakhir Rp66.972.000 dari 775 struk, profit Rp20.100.000 (margin 30,0%).', [ringkas]).ok
);

const turun = buildComparePeriodsData({
  current: { qty: 82, gross: 820000, discount: 0, cost: 0, discountedQty: 0 },
  baseline: { qty: 100, gross: 1000000, discount: 0, cost: 0, discountedQty: 0 },
  empty: false,
  period: 'last_30d',
  windowLabel: '30 hari terakhir',
  baselineLabel: '30 hari sebelumnya'
});
ok('persen turun diterima', verifyGrounding('Profit turun 18,0%.', [turun]).ok);
ok('jumlah hari dari label diterima', verifyGrounding('Periode 30 hari.', [ringkas]).ok);
ok('satuan struk boleh disebut transaksi', verifyGrounding('Ada 775 transaksi.', [ringkas]).ok);

const naikBesar = buildComparePeriodsData({
  current: { qty: 225, gross: 225000, discount: 0, cost: 0, discountedQty: 0 },
  baseline: { qty: 100, gross: 100000, discount: 0, cost: 0, discountedQty: 0 },
  empty: false,
  period: 'last_30d',
  windowLabel: '30 hari terakhir',
  baselineLabel: '30 hari sebelumnya'
});
ok('rupiah berspasi ditolak', !verifyGrounding('Omzet Rp 99.999.000.', [ringkas]).ok);
ok('singkatan juta ditolak', !verifyGrounding('Omzet 67 juta.', [ringkas]).ok);
ok('singkatan jt ditolak', !verifyGrounding('Omzet 20jt.', [ringkas]).ok);
ok('singkatan ribu ditolak', !verifyGrounding('Diskon 2 ribu.', [ringkas]).ok);
ok('singkatan rb ditolak', !verifyGrounding('Diskon 5rb.', [ringkas]).ok);
ok('jumlah struk karangan ditolak', !verifyGrounding('Ada 99 struk.', [ringkas]).ok);
ok('rupiah karangan ditolak', !verifyGrounding('Omzet Rp99.999.000.', [ringkas]).ok);
ok('persen karangan ditolak', !verifyGrounding('Margin 40%.', [naikBesar]).ok);
ok('singkatan miliar ditolak', !verifyGrounding('Rugi 3 miliar.', [ringkas]).ok);
ok('rupiah tanpa pemisah ditolak', !verifyGrounding('Omzet Rp66972000.', [ringkas]).ok);

if (failed) process.exit(1);

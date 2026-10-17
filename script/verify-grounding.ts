import { stripUnsupported, verifyGrounding } from '../src/lib/server/domains/copilot/grounding';
import { buildSummaryData } from '../src/lib/server/domains/copilot/tools/summary';
import { buildComparePeriodsData } from '../src/lib/server/domains/copilot/tools/compare-periods';
import { buildSimulatePriceData } from '../src/lib/server/domains/copilot/tools/simulate-price';
import { failure } from '../src/lib/server/domains/copilot/envelope';

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
ok('persen tanpa desimal setara', verifyGrounding('Profit turun 18%.', [turun]).ok);
ok('persen dibulatkan dalam toleransi', verifyGrounding('Profit turun 18,04%.', [turun]).ok);
ok('persen dengan digit karangan tetap ditolak', !verifyGrounding('Profit turun 18,3%.', [turun]).ok);
ok('persen dengan bilangan berbeda tetap ditolak', !verifyGrounding('Profit turun 5%.', [turun]).ok);
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

const jawabanLalu = 'Total modal (cost): Rp308.638.903. Total profit: Rp8.631.097.';
ok('angka dari jawaban sebelumnya diterima', verifyGrounding('Modal Rp308.638.903, profit Rp8.631.097.', [], [jawabanLalu]).ok);
ok('angka baru tetap ditolak walau ada jawaban sebelumnya', !verifyGrounding('Modal Rp999.999.', [], [jawabanLalu]).ok);
ok('singkatan juta tetap ditolak walau ada jawaban sebelumnya', !verifyGrounding('Modal sekitar 308 juta.', [], [jawabanLalu]).ok);
ok('tanpa jawaban sebelumnya angka tetap ditolak', !verifyGrounding('Modal Rp308.638.903.', []).ok);

const lowMargin = buildSimulatePriceData({
  product: { id: 'p1', name: 'Cleo 3D 1500 ml', sellingPrice: 10000, costPrice: 9000 },
  baseline: { qty: 100, gross: 1000000, discount: 0, cost: 900000, discountedQty: 0 },
  period: 'last_30d',
  windowLabel: '30 hari terakhir',
  targetPrice: 10500,
  pricePct: 5,
  volumePcts: [0]
});
ok('angka di teks flag diterima', verifyGrounding('Margin simulasi di bawah 15%.', [lowMargin]).ok);
ok('angka karangan tetap ditolak walau ada teks flag', !verifyGrounding('Margin simulasi di bawah 16%.', [lowMargin]).ok);
const batas = failure('simulate_price', 'INVALID_ARGS', 'Perubahan harga Copilot dibatasi hingga ±30% dari harga saat ini.');
ok('angka di pesan error diterima', verifyGrounding('Perubahan harga dibatasi ±30%.', [batas]).ok);
const ambigu = failure('simulate_price', 'AMBIGUOUS_PRODUCT', "Ada 3 produk yang cocok dengan 'cleo'.", [
  { id: '019ff3e1-6821-7776-b171-3fbb467b2b91', name: 'Cleo 3D 1500 ml' }
]);
ok('jumlah di pesan error diterima', verifyGrounding('Ada 3 produk yang cocok.', [ambigu]).ok);
ok('angka di nama produk bukan sumber satuan', !verifyGrounding('Ada 1500 produk.', [ambigu]).ok);
ok('angka di id bukan sumber satuan', !verifyGrounding('Ada 6821 produk.', [ambigu]).ok);

const dibuang = stripUnsupported('Omzet Rp125.000. Profit Rp999.999 bulan ini.', [kecil]);
ok('kalimat angka karangan dibuang, sisanya tetap', dibuang.text === 'Omzet Rp125.000.' && dibuang.removed === 1);
ok('jawaban bersih tidak berubah', stripUnsupported('Omzet Rp125.000.', [kecil]).removed === 0);
ok('semua kalimat bermasalah jadi kosong', stripUnsupported('Omzet Rp999.999.', [kecil]).text === '');
const daftar = stripUnsupported('Ringkasan:\n- Omzet Rp125.000.\n- Profit Rp999.999.\n- Margin 20,0%.', [kecil]);
ok('daftar tetap berbaris, baris bermasalah hilang', daftar.text === 'Ringkasan:\n- Omzet Rp125.000.\n- Margin 20,0%.' && daftar.removed === 1);

if (failed) process.exit(1);

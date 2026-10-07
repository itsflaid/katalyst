import { fmtDays } from '../src/lib/shared/format';
import { toModelView } from '../src/lib/server/domains/copilot/model-view';
import { buildInventoryData, type InventoryProduct } from '../src/lib/server/domains/copilot/tools/inventory';

let failed = 0;
function ok(label: string, pass: boolean, detail = '') {
  console.log(`  ${pass ? '\x1b[32mPASS' : '\x1b[31mFAIL'}\x1b[0m  ${label}${detail ? `: ${detail}` : ''}`);
  if (!pass) failed++;
}

function finiteDeep(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finiteDeep);
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).every(finiteDeep);
  return true;
}

function item(name: string, stock: number, minStock: number, costPrice: number, isActive: boolean, sold: number): [InventoryProduct, [string, number]] {
  return [{ id: name, name, stock, minStock, costPrice, isActive }, [name, sold]];
}

const rows: [InventoryProduct, [string, number]][] = [
  item('Kerupuk Kepiting 250g', 3, 5, 8000, true, 17),
  item('Madu Kelulut Kaltim 250ml', 5, 10, 40000, true, 1),
  item('Sarung Samarinda', 1, 5, 75000, true, 2),
  item('Abon Ikan 150g', 43, 5, 15000, true, 17),
  item('Amplang Ikan Tenggiri 250g', 20, 5, 12000, true, 89),
  item('Amplang Udang 200g', 39, 5, 10000, true, 31),
  item('Kaos Pesut Mahakam', 70, 5, 50000, true, 41),
  item('Keripik Pisang Manis 200g', 25, 5, 7000, true, 125),
  item('Kerupuk Ikan Curah 500g', 40, 5, 6000, true, 160),
  item('Terasi Udang 250g', 0, 5, 9000, false, 0),
  item('Kecap Manis 500ml', 12, 5, 10000, false, 0)
];
const products = rows.map(([p]) => p);
const sold = new Map(rows.map(([, s]) => s));

const data = buildInventoryData(products, sold, 'all', 10);
ok('ringkasan sembilan aktif', data.summary.activeCount === 9 && data.summary.outCount === 0 && data.summary.lowCount === 3 && data.summary.deadCount === 0 && data.summary.urgentCount === 5);
ok('nonaktif terpisah', data.summary.inactive.count === 2 && data.summary.inactive.stockValue === 120000 && data.summary.inactive.stockValueText === 'Rp120.000');
ok('nonaktif tidak di daftar', data.items.every((i) => i.name !== 'Terasi Udang 250g' && i.name !== 'Kecap Manis 500ml'));
ok(
  'kalimat siap pakai',
  data.summary.lines[0] === '9 produk aktif: 0 habis, 3 menipis, 5 diperkirakan habis dalam 7 hari.' &&
    data.summary.lines[1] === 'Produk nonaktif: 2 produk, nilai stok Rp120.000 (tidak ikut peringatan stok).'
);

const urgent = buildInventoryData(products, sold, 'urgent', 10);
ok(
  'urutan hampir habis',
  urgent.items.map((i) => i.name).join('|') === 'Kerupuk Kepiting 250g|Keripik Pisang Manis 200g|Amplang Ikan Tenggiri 250g|Kerupuk Ikan Curah 500g|Sarung Samarinda'
);
ok(
  'teks hari menutup',
  urgent.items.map((i) => i.daysCoverText).join('|') === '±2,5 hari|±2,8 hari|±3,1 hari|±3,5 hari|±7 hari'
);
ok('filter habis kosong', buildInventoryData(products, sold, 'out', 10).empty);

const outRows = [item('Kosong', 0, 5, 1000, true, 4)[0], item('Ada', 10, 5, 1000, true, 5)[0]];
const outOnly = buildInventoryData(outRows, new Map([['Kosong', 4], ['Ada', 5]]), 'out', 10);
ok(
  'habis tampil pertama dan satu-satunya',
  outOnly.items.length === 1 && outOnly.items[0].name === 'Kosong' && outOnly.items[0].statusText === 'habis' && outOnly.items[0].daysCoverText === 'habis'
);

const deadRows = [item('Mati', 8, 5, 1000, true, 0)[0]];
const deadOnly = buildInventoryData(deadRows, new Map(), 'dead', 10);
ok(
  'mati tanpa penjualan',
  deadOnly.items.length === 1 && deadOnly.items[0].daysCover === null && deadOnly.items[0].daysCoverText === 'tidak ada penjualan 14 hari'
);

const many = Array.from({ length: 12 }, (_, i) => item(`Barang ${i}`, 10 + i, 5, 1000, true, 1 + i));
const cut = buildInventoryData(
  many.map(([p]) => p),
  new Map(many.map(([, s]) => s)),
  'all',
  5
);
ok('potong tetap dari dua belas', cut.summary.truncated && cut.summary.activeCount === 12 && cut.summary.total === 12 && cut.summary.shown === 5);

ok('fmtDays', fmtDays(2.47) === '2,5' && fmtDays(7) === '7' && fmtDays(70) === '70' && fmtDays(35.41) === '35');
ok('tanpa NaN atau Infinity', finiteDeep(JSON.parse(JSON.stringify(data))));
const view = JSON.stringify(toModelView(data));
ok('proyeksi model hanya memuat teks angka', !view.includes('645000') && view.includes('Rp645.000'));

if (failed) process.exit(1);

import { estimateDaysCover, summarizeInventoryRows, type InventoryRow } from '../src/lib/analytics/inventory';

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

const rows: InventoryRow[] = [
	{ id: 'a1', name: 'Habis', stock: 0, costPrice: 10000, minStock: 5, sold14: 4, isActive: true },
	{ id: 'a2', name: 'Menipis', stock: 3, costPrice: 10000, minStock: 5, sold14: 10, isActive: true },
	{ id: 'a3', name: 'Aman', stock: 20, costPrice: 5000, minStock: 5, sold14: 14, isActive: true },
	{ id: 'a4', name: 'Mati', stock: 8, costPrice: 2000, minStock: 5, sold14: 0, isActive: true },
	{ id: 'i1', name: 'Arsip kosong', stock: 0, costPrice: 10000, minStock: 5, sold14: 0, isActive: false },
	{ id: 'i2', name: 'Arsip berstok', stock: 12, costPrice: 10000, minStock: 5, sold14: 5, isActive: false }
];

const res = summarizeInventoryRows(rows, 14);
ok('peringatan tanpa nonaktif', res.outCount === 1 && res.restockCount === 1 && res.deadCount === 1);
ok('nilai mati benar', res.deadValue === 16000, `dapat=${res.deadValue}`);
ok('stok total memuat semua', res.stockValue === 266000, `dapat=${res.stockValue}`);
ok('nonaktif terpisah', res.inactiveStock.count === 1 && res.inactiveStock.value === 120000, JSON.stringify(res.inactiveStock));
ok('daftar tanpa nonaktif', res.deadList.every((p) => p.id !== 'i2') && res.daysList.every((p) => p.id !== 'i2'));
ok('urutan hari mendesak', res.daysList.map((p) => p.id).join('|') === 'a1|a2|a3', res.daysList.map((p) => p.id).join('|'));

// Salinan perhitungan lama atas baris aktif saja; hasilnya harus identik.
const active = rows.filter((r) => r.isActive);
const oldStockValue = active.reduce((s, p) => s + p.stock * p.costPrice, 0);
const oldOut = active.filter((p) => p.stock <= 0).length;
const oldRestock = active.filter((p) => p.stock > 0 && p.stock <= (p.minStock ?? 5)).length;
const oldDead = active
	.filter((p) => p.stock > 0 && p.sold14 === 0)
	.map((p) => ({ id: p.id, name: p.name, stock: p.stock, value: p.stock * p.costPrice }))
	.sort((a, b) => b.value - a.value);
const oldDays = active
	.filter((p) => p.sold14 > 0)
	.map((p) => ({ id: p.id, name: p.name, stock: p.stock, days: estimateDaysCover(p.stock, p.sold14, 14) }))
	.sort((a, b) => a.days - b.days)
	.slice(0, 8);
const onlyActive = summarizeInventoryRows(active, 14);
ok(
	'histori aktif identik lama',
	onlyActive.stockValue === oldStockValue &&
		onlyActive.outCount === oldOut &&
		onlyActive.restockCount === oldRestock &&
		JSON.stringify(onlyActive.deadList) === JSON.stringify(oldDead.slice(0, 5)) &&
		JSON.stringify(onlyActive.daysList) === JSON.stringify(oldDays)
);

console.log(`\n${passCount} passed, ${failCount} failed\n`);
if (failCount > 0) process.exit(1);

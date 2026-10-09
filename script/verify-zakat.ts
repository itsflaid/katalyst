import { daysBetween, zakatImpactOf, zakatOf, HAUL_DAYS, ZAKAT_RATE, type ZakatInput } from '../src/lib/analytics/zakat';
import { parseBalanceForm, parseSettingForm } from '../src/lib/server/domains/zakat/validate';

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

const base: ZakatInput = {
  stockCost: 50_000_000,
  stockSelling: 80_000_000,
  valuation: 'SELLING',
  cash: 10_000_000,
  receivable: 5_000_000,
  debt: 3_000_000,
  goldPricePerGram: 1_350_000,
  nisabGrams: 85,
  haulStartDate: '2025-10-20',
  today: '2026-10-08'
};
// asetBersih = 80jt + 10jt + 5jt − 3jt = 92jt; nisab = 85 × 1,35jt = 114,75jt.

console.log('\n== ambang nisab ==');
{
  const below = zakatOf(base);
  ok('di bawah nisab jumlah 0', below.amount === 0 && below.status === 'BELOW_NISAB' && below.nisabReached === false);
  const exact: ZakatInput = { ...base, stockSelling: 100_000_000, cash: 10_000_000, receivable: 4_750_000, debt: 0, haulStartDate: '2024-01-01' };
  const at = zakatOf(exact);
  ok('tepat sama dengan nisab dihitung tercapai', at.nisabReached === true && at.amount === Math.round(ZAKAT_RATE * 114_750_000) && at.status === 'DUE', `amount=${at.amount}`);
}

console.log('\n== harga emas nol ==');
{
  const zero = zakatOf({ ...base, goldPricePerGram: 0, stockSelling: 1_000, cash: 0, receivable: 0, debt: 0 });
  ok('harga emas 0 dianggap belum diisi', zero.status === 'NEEDS_GOLD_PRICE' && zero.nisab === null && zero.amount === 0 && zero.missing.includes('goldPrice'));
}

console.log('\n== validasi form ==');
{
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  };
  const setting = (fields: Record<string, string>) => parseSettingForm(form({ nisabGrams: '85', stockValuation: 'SELLING', ...fields }));
  const balance = (cash: string) => parseBalanceForm(form({ cash, receivable: '', debt: '' }));
  const cashOf = (r: ReturnType<typeof balance>) => ('data' in r ? r.data.cash : 'ditolak');

  ok('harga emas 0 ditolak', 'error' in setting({ goldPrice: '0' }));
  ok('harga emas kosong = belum diisi', 'data' in setting({ goldPrice: '' }) && (setting({ goldPrice: '' }) as { data: { goldPricePerGram: number | null } }).data.goldPricePerGram === null);
  ok('harga emas di atas batas kolom integer ditolak', 'error' in setting({ goldPrice: '2147483648' }) && 'data' in setting({ goldPrice: '2147483647' }));
  ok('nisab 0 dan di atas batas ditolak', 'error' in setting({ goldPrice: '1350000', nisabGrams: '0' }) && 'error' in setting({ goldPrice: '1350000', nisabGrams: '1000001' }));
  ok('kas 0 sah, kosong = null', cashOf(balance('0')) === 0 && cashOf(balance('')) === null);
  ok('titik ribuan dibuang', cashOf(balance('1.350.000')) === 1_350_000);
  ok('desimal ditolak, bukan dibaca 10 kali lipat', cashOf(balance('1350000.5')) === 'ditolak' && cashOf(balance('1.5')) === 'ditolak');
  ok('notasi ilmiah, negatif, dan koma ditolak', cashOf(balance('1e6')) === 'ditolak' && cashOf(balance('-5')) === 'ditolak' && cashOf(balance('1,5')) === 'ditolak');
}

console.log('\n== null lawan nol ==');
{
  const withNull = zakatOf({ ...base, cash: null });
  const withZero = zakatOf({ ...base, cash: 0 });
  ok('angka sama', withNull.netAssets === withZero.netAssets && withNull.amount === withZero.amount);
  ok('missing berbeda', withNull.missing.includes('cash') && !withZero.missing.includes('cash'));
}

console.log('\n== harga emas ==');
{
  const noGold = zakatOf({ ...base, goldPricePerGram: null });
  ok('tanpa harga emas NEEDS_GOLD_PRICE', noGold.status === 'NEEDS_GOLD_PRICE' && noGold.nisab === null && noGold.nisabReached === null);
}

console.log('\n== haul ==');
{
  const r = zakatOf(base);
  ok('jatuh tempo = mulai + 354 hari', r.haul.dueDate === '2026-10-09', `due=${r.haul.dueDate}`);
  ok('sisa hari benar', r.haul.daysLeft === 1 && r.haul.reached === false);
  const edge = zakatOf({ ...base, today: '2026-10-09' });
  ok('tepat tempo dihitung genap', edge.haul.daysLeft === 0 && edge.haul.reached === true);
  const noStart = zakatOf({ ...base, haulStartDate: null });
  ok('tanpa tanggal haul null', noStart.haul.dueDate === null && noStart.haul.reached === null && noStart.missing.includes('haulStart'));
  ok('konstanta 354', HAUL_DAYS === 354);
  ok('selisih hari kalender', daysBetween('2026-10-01', '2026-10-08') === 7 && daysBetween('asal', '2026-10-08') === null);
}

console.log('\n== valuasi dan aset negatif ==');
{
  const cost = zakatOf({ ...base, valuation: 'COST' });
  const selling = zakatOf(base);
  ok('COST lawan SELLING beda nilai stok', cost.stockValue === 50_000_000 && selling.stockValue === 80_000_000);
  const negative = zakatOf({ ...base, debt: 200_000_000 });
  ok('aset negatif jumlah 0', negative.netAssets < 0 && negative.amount === 0 && negative.status === 'BELOW_NISAB');
}

console.log('\n== dampak simulasi ==');
{
  const dueBase: ZakatInput = { ...base, haulStartDate: '2024-01-01' };
  const flat = zakatImpactOf(dueBase, { statusQuo: 1_000_000, simulated: 1_000_000 });
  ok('selisih nol tidak mengubah', flat.deltaNetAssets === 0 && flat.deltaAmount === 0 && flat.crossesNisab === false);
  const up = zakatImpactOf(dueBase, { statusQuo: 1_000_000, simulated: 2_000_000 });
  ok('selisih positif menaikkan', up.deltaNetAssets === 1_000_000 && up.after.netAssets === up.before.netAssets + 1_000_000 && up.deltaAmount === up.after.amount - up.before.amount);
  const down = zakatImpactOf(dueBase, { statusQuo: 2_000_000, simulated: 1_000_000 });
  ok('selisih negatif menurunkan', down.deltaNetAssets === -1_000_000 && down.after.netAssets < down.before.netAssets);
  // 92jt + 22,75jt = 114,75jt = tepat nisab.
  const cross = zakatImpactOf(dueBase, { statusQuo: 0, simulated: 22_750_000 });
  ok('melewati nisab terdeteksi', cross.before.nisabReached === false && cross.after.nisabReached === true && cross.crossesNisab === true);
}

console.log(`\n${passCount} passed, ${failCount} failed\n`);
if (failCount > 0) process.exit(1);

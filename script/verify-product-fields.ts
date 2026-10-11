// Verifikasi validasi form produk (murni, tanpa DB).
// Pola skrip lain: ok per kasus + ringkasan, exit 1 bila gagal.
import { INT4_MAX, MAX_PRICE, parseInitialStock, parseProductFields } from '../src/lib/server/domains/products/validate';

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

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function fields(over: Record<string, string> = {}) {
  return form({ name: 'Kopi', costPrice: '10000', sellingPrice: '15000', isActive: 'on', minStock: '5', ...over });
}

console.log('product-fields:');
const valid = parseProductFields(fields());
ok('valid lolos apa adanya', valid.data?.name === 'Kopi' && valid.data?.costPrice === 10000 && valid.data?.sellingPrice === 15000, JSON.stringify(valid));
ok('batas atas lolos', parseProductFields(fields({ sellingPrice: '100000000' })).data?.sellingPrice === 100000000);
ok('100000001 ditolak', 'error' in parseProductFields(fields({ sellingPrice: '100000001' })));
ok('3 miliar ditolak', 'error' in parseProductFields(fields({ sellingPrice: '3000000000' })));
ok('modal 100000001 ditolak', 'error' in parseProductFields(fields({ costPrice: '100000001' })));
ok('modal kosong jadi 0', parseProductFields(fields({ costPrice: '' })).data?.costPrice === 0);
ok('jual kosong ditolak', 'error' in parseProductFields(fields({ sellingPrice: '' })));
ok('jual 0.4 ditolak', 'error' in parseProductFields(fields({ sellingPrice: '0.4' })));
ok('jual abc dan Infinity ditolak', 'error' in parseProductFields(fields({ sellingPrice: 'abc' })) && 'error' in parseProductFields(fields({ sellingPrice: 'Infinity' })));
ok('minStock kosong default 5', parseProductFields(fields({ minStock: '' })).data?.minStock === 5);
ok('minStock 100001 ditolak', 'error' in parseProductFields(fields({ minStock: '100001' })));
ok("parseInitialStock('') jadi 0", parseInitialStock(form({})).data === 0);
ok('stok 1000001 dan 1.5 ditolak', 'error' in parseInitialStock(form({ stock: '1000001' })) && 'error' in parseInitialStock(form({ stock: '1.5' })));
ok('MAX_PRICE di bawah INT4_MAX', MAX_PRICE < INT4_MAX && INT4_MAX === 2147483647, `${MAX_PRICE}/${INT4_MAX}`);

console.log(`\n${passCount} passed, ${failCount} failed`);
if (failCount > 0) process.exit(1);

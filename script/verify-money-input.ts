import { digitsOnly, groupDigits, reformatMoneyInput } from '../src/lib/shared/format';
import { insightSignature } from '../src/lib/shared/insight-toast';
import { parseProductFields } from '../src/lib/server/domains/products/validate';
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

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

console.log('\n== groupDigits / digitsOnly ==');
{
  ok('kosong tetap kosong', groupDigits('') === '');
  ok('3 digit tanpa titik', groupDigits('999') === '999');
  ok('4 digit', groupDigits('1000') === '1.000');
  ok('7 digit', groupDigits('1234567') === '1.234.567');
  ok('digitsOnly membuang Rp, titik, spasi', digitsOnly('Rp 1.350.000') === '1350000');
}

console.log('\n== reformatMoneyInput: ketik dan tempel ==');
{
  const a = reformatMoneyInput('1000000', 7);
  ok('1000000 jadi 1.000.000, kursor di akhir', a.text === '1.000.000' && a.value === '1000000' && a.caret === 9, JSON.stringify(a));
  const b = reformatMoneyInput('1.0000', 6);
  ok('ketik 0 di akhir 1.000', b.text === '10.000' && b.caret === 6, JSON.stringify(b));
  const c = reformatMoneyInput('15.000', 2);
  ok('ketik di tengah: kursor tetap setelah digit yang diketik', c.text === '15.000' && c.caret === 2, JSON.stringify(c));
  const d = reformatMoneyInput('', 0);
  ok('kosong tetap kosong (belum diisi, bukan 0)', d.text === '' && d.value === '' && d.caret === 0, JSON.stringify(d));
  const e = reformatMoneyInput('abc12x', 6);
  ok('huruf dibuang', e.text === '12' && e.value === '12', JSON.stringify(e));
  const f = reformatMoneyInput('Rp 1.350.000', 12);
  ok('tempel dengan Rp dan titik', f.text === '1.350.000' && f.value === '1350000', JSON.stringify(f));
  const g = reformatMoneyInput('007', 3);
  ok('nol di depan dibuang', g.text === '7' && g.caret === 1, JSON.stringify(g));
  const h = reformatMoneyInput('05', 1);
  ok('nol di depan kursor tidak menggeser kursor', h.text === '5' && h.caret === 0, JSON.stringify(h));
  const i = reformatMoneyInput('0', 1);
  ok('satu nol dipertahankan', i.text === '0' && i.value === '0', JSON.stringify(i));
  const j = reformatMoneyInput('9'.repeat(20), 20);
  ok('dibatasi 15 digit', j.value.length === 15, JSON.stringify(j));
}

console.log('\n== reformatMoneyInput: hapus titik ==');
{
  const a = reformatMoneyInput('10000', 2, '10.000', 'deleteContentBackward');
  ok('Backspace tepat setelah titik menghapus digit di kirinya', a.text === '1.000' && a.value === '1000' && a.caret === 1, JSON.stringify(a));
  const b = reformatMoneyInput('1000', 1, '1.000', 'deleteContentForward');
  ok('Delete tepat sebelum titik menghapus digit di kanannya', b.text === '100' && b.caret === 1, JSON.stringify(b));
  const c = reformatMoneyInput('1.0000', 6, '1.000', 'insertText');
  ok('ketik digit bukan penghapusan', c.text === '10.000', JSON.stringify(c));
  const d = reformatMoneyInput('1000', 4, '1.000', 'insertFromPaste');
  ok('tempel yang lebih pendek bukan penghapusan', d.text === '1.000' && d.caret === 5, JSON.stringify(d));
  const e = reformatMoneyInput('1.00', 4, '1.000', 'deleteContentBackward');
  ok('Backspace pada digit biasa tetap menghapus digit itu', e.text === '100' && e.value === '100', JSON.stringify(e));
}

console.log('\n== kontrak server: hidden input membawa digit mentah ==');
{
  const p = parseProductFields(form({ name: 'Kopi', costPrice: '15000', sellingPrice: '25000' }));
  ok('produk menerima digit mentah', 'data' in p && p.data?.costPrice === 15000 && p.data?.sellingPrice === 25000, JSON.stringify(p));
  // Number("15.000") terbaca 15 tanpa error: teks bertitik tidak boleh pernah dikirim ke server produk.
  const dotted = parseProductFields(form({ name: 'Kopi', costPrice: '15.000', sellingPrice: '25.000' }));
  ok('produk salah baca teks bertitik (alasan hidden input membawa digit mentah)', !('data' in dotted) || dotted.data?.costPrice !== 15000, JSON.stringify(dotted));
  const multi = parseProductFields(form({ name: 'Kopi', costPrice: '1.350.000', sellingPrice: '2.000.000' }));
  ok('produk menolak teks bertitik ganda', 'error' in multi, JSON.stringify(multi));
  const z = parseBalanceForm(form({ cash: '10000000', receivable: '', debt: '0' }));
  ok('zakat: digit mentah, kosong = null, 0 = nol', 'data' in z && z.data.cash === 10_000_000 && z.data.receivable === null && z.data.debt === 0, JSON.stringify(z));
  const s = parseSettingForm(form({ goldPrice: '1350000', nisabGrams: '85', haulStartDate: '', stockValuation: 'SELLING' }));
  ok('zakat: harga emas digit mentah', 'data' in s && s.data.goldPricePerGram === 1_350_000, JSON.stringify(s));
}

console.log('\n== insightSignature ==');
{
  const x = insightSignature([
    { type: 'popular_low_margin', productId: 'b' },
    { type: 'high_revenue_low_profit', productId: 'a' }
  ]);
  const y = insightSignature([
    { type: 'high_revenue_low_profit', productId: 'a' },
    { type: 'popular_low_margin', productId: 'b' }
  ]);
  ok('urutan tidak berpengaruh', x === y, `${x} | ${y}`);
  ok('kumpulan berbeda, tanda berbeda', x !== insightSignature([{ type: 'popular_low_margin', productId: 'b' }]));
  ok('kosong menghasilkan string kosong', insightSignature([]) === '');
}

console.log(`\n${passCount} passed, ${failCount} failed\n`);
if (failCount > 0) process.exit(1);

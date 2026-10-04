import { SubrequestBudget } from '../src/lib/server/domains/copilot/budget';
import { fmtDelta, fmtInt, fmtPercent, fmtPoints, fmtRupiah } from '../src/lib/shared/format';
import { resolveProduct } from '../src/lib/server/domains/copilot/product-resolver';
import { sanitizeText } from '../src/lib/server/domains/copilot/sanitize';
import { validateArgs } from '../src/lib/server/domains/copilot/validate';
import { TOOL_REGISTRY } from '../src/lib/server/domains/copilot/registry';
import { toModelView } from '../src/lib/server/domains/copilot/model-view';

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

console.log('\n== budget ==');
{
  const b = new SubrequestBudget();
  ok('default 45', b.limit === 45 && b.used === 0 && b.remaining() === 45);
  b.spend();
  b.spend(4);
  ok('spend bertambah', b.used === 5 && b.remaining() === 40, `used=${b.used}`);
  ok('canAfford di batas', b.canAfford(40) && !b.canAfford(41));
  b.spend(40);
  ok('habis tepat di limit', b.used === 45 && b.remaining() === 0);
  let thrown = '';
  try {
    b.spend();
  } catch (e) {
    thrown = String(e);
  }
  ok('melewati batas melempar BUDGET_EXCEEDED', thrown.includes('BUDGET_EXCEEDED'), thrown);
  ok('gagal spend tidak menambah used', b.used === 45);
}

console.log('\n== format ==');
{
  ok('rupiah tanpa spasi tak-putus', fmtRupiah(1_250_000) === 'Rp1.250.000' && !fmtRupiah(1_250_000).includes('\u00a0'));
  ok('rupiah negatif dan nol', fmtRupiah(-250_000) === '-Rp250.000' && fmtRupiah(0) === 'Rp0');
  ok('integer bertanda', fmtInt(1_250) === '1.250' && fmtInt(-5) === '-5');
  ok('persen, delta, dan poin', fmtPercent(0.183) === '18,3%' && fmtDelta(0.12) === '+12,0%' && fmtDelta(null) === 'baru' && fmtPoints(-0.021) === '-2,1% poin');
}

console.log('\n== copilot core ==');
{
  const products = [
    { id: 'a', name: 'Amplang Ikan Tenggiri 250g' },
    { id: 'b', name: 'Amplang Udang 200g' },
    { id: 'c', name: 'Bolu Cinta' }
  ];
  const valid = validateArgs({ period: 'this_month' }, { period: { type: 'string', required: true, enum: ['this_month'] } });
  const invalid = validateArgs({ period: 'this_month', businessId: 'lain' }, { period: { type: 'string', required: true } });
  ok('validator menolak kunci asing', valid.ok && !invalid.ok);
  ok('resolver persis', resolveProduct('bolu cinta', products).kind === 'found');
  ok('resolver ambigu', resolveProduct('amplang', products).kind === 'ambiguous');
  ok('resolver produk tidak ada', resolveProduct('kerupuk', products).kind === 'not_found');
  ok('sanitasi membuang kontrol', sanitizeText(' Nama\u200b\nProduk\u0000 ') === 'Nama Produk');
  ok('registri memuat enam tool aktif', TOOL_REGISTRY.length === 6 && TOOL_REGISTRY.every((tool) => tool.enabled));
  const modelView = JSON.stringify(toModelView({ revenue: 125000, revenueText: 'Rp125.000', nested: { margin: 0.2, marginText: '20,0%' } }));
  ok('proyeksi model hanya memuat teks angka', !modelView.includes('125000') && !modelView.includes('0.2') && modelView.includes('Rp125.000'));
}

console.log(`\n${passCount} passed, ${failCount} failed\n`);
if (failCount > 0) process.exit(1);

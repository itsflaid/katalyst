// Kunci subset markdown balon chat: teks polos, tebal, daftar, tabel, dan HTML jawaban LLM selalu di-escape.
import { renderChatMarkdown } from '../src/lib/shared/chat-markdown';

let failed = 0;
function ok(label: string, pass: boolean, detail = '') {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}${detail && !pass ? `: ${detail}` : ''}`);
  if (!pass) failed++;
}

ok('teks polos jadi paragraf', renderChatMarkdown('Halo, ada yang bisa dibantu?') === '<p>Halo, ada yang bisa dibantu?</p>');
ok('tebal dirender', renderChatMarkdown('Omzet **Rp125.000**.') === '<p>Omzet <strong>Rp125.000</strong>.</p>');
ok('miring dirender', renderChatMarkdown('Naik *signifikan* bulan ini.') === '<p>Naik <em>signifikan</em> bulan ini.</p>');
ok('kode dirender', renderChatMarkdown('Buka `halaman simulator`.') === '<p>Buka <code>halaman simulator</code>.</p>');
ok(
  'HTML jawaban di-escape',
  (() => {
    const html = renderChatMarkdown('<script>alert(1)</script>');
    return html.includes('&lt;script&gt;') && !html.includes('<script>');
  })()
);
ok(
  'daftar dirender',
  renderChatMarkdown('- Kopi\n- Gula').includes('<ul><li>Kopi</li><li>Gula</li></ul>')
);
ok(
  'daftar bernomor dirender',
  renderChatMarkdown('1. Pertama\n2. Kedua').includes('<ol><li>Pertama</li><li>Kedua</li></ol>')
);
ok(
  'tabel dirender',
  (() => {
    const html = renderChatMarkdown('| Produk | Omzet |\n|---|---|\n| Kopi | **Rp125.000** |');
    return html.includes('<th>Produk</th>') && html.includes('<td><strong>Rp125.000</strong></td>');
  })()
);
ok('judul dirender', renderChatMarkdown('### Rincian').includes('<h4>Rincian</h4>'));
ok('baris baru jadi jeda baris', renderChatMarkdown('Baris satu\nBaris dua').includes('<p>Baris satu<br>Baris dua</p>'));
if (failed) process.exit(1);

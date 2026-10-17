import { copilotPrompt } from '../src/lib/server/domains/copilot/prompt';
import { TOOL_REGISTRY } from '../src/lib/server/domains/copilot/registry';

const CHARS_LIMIT = 6400;

// Diukur dengan baris produk terakhir terisi nama sepanjang batas potong (40 karakter).
const system = copilotPrompt({
  businessName: 'Toko Contoh',
  dateLabel: '9 Okt 2026',
  tz: 'Asia/Makassar',
  lastProductName: 'Amplang Ikan Pesut Mahakam Premium 250g'
});
let chars = system.length;
console.log(`system prompt: ${system.length} karakter`);
for (const tool of TOOL_REGISTRY.filter((t) => t.enabled)) {
  const spec = JSON.stringify({ name: tool.name, description: tool.description, parameters: tool.parameters });
  chars += spec.length;
  console.log(`${tool.name}: ${spec.length} karakter`);
}
// Guard ukuran dalam karakter, bukan token. Live gpt-oss-120b: spec ≈5,7rb karakter
// terbaca ≈1,5rb token; request penuh (10 pesan konteks + 1 hasil tool) ≈2,2rb token.
console.log(`TOTAL system + spesifikasi: ${chars} karakter (batas ${CHARS_LIMIT})`);
if (chars > CHARS_LIMIT) {
  console.log('MELEBIHI BATAS');
  process.exit(1);
}

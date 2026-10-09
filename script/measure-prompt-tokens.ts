import { copilotPrompt } from '../src/lib/server/domains/copilot/prompt';
import { TOOL_REGISTRY } from '../src/lib/server/domains/copilot/registry';

const system = copilotPrompt({ businessName: 'Toko Contoh', dateLabel: '9 Okt 2026', tz: 'Asia/Makassar' });
const tokensOf = (s: string) => s.length / 3;
let total = tokensOf(system);
console.log(`system prompt: ${total.toFixed(0)} token (${system.length} karakter)`);
for (const tool of TOOL_REGISTRY.filter((t) => t.enabled)) {
  const spec = JSON.stringify({ name: tool.name, description: tool.description, parameters: tool.parameters });
  const tokens = tokensOf(spec);
  total += tokens;
  console.log(`${tool.name}: ${tokens.toFixed(0)} token (${spec.length} karakter)`);
}
console.log(`TOTAL system + spesifikasi: ${total.toFixed(0)} token (batas 1800)`);
if (total > 1800) {
  console.log('MELEBIHI BATAS');
  process.exit(1);
}

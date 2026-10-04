import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/server/db/schema';
import { business } from '../src/lib/server/db/schema';
import { SubrequestBudget } from '../src/lib/server/domains/copilot/budget';
import { findTool } from '../src/lib/server/domains/copilot/registry';
import type { ToolContext } from '../src/lib/server/domains/copilot/context';

let failed = 0;
function ok(label: string, pass: boolean) {
  console.log(`  ${pass ? '\x1b[32mPASS' : '\x1b[31mFAIL'}\x1b[0m  ${label}`);
  if (!pass) failed++;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum di-set.');
  const client = postgres(process.env.DATABASE_URL);
  try {
    const db = drizzle(client, { schema });
    const [current] = await db.select().from(business).limit(1);
    if (!current) throw new Error('Tidak ada bisnis untuk memverifikasi tool. Jalankan seed demo.');
    const ctx: ToolContext = { businessId: current.id, tz: current.timezone as ToolContext['tz'], now: new Date(), db, budget: new SubrequestBudget() };
    const cases: [string, unknown][] = [
      ['get_summary', { period: 'last_30d' }],
      ['rank_products', { period: 'last_30d', by: 'qty', order: 'desc' }],
      ['compare_periods', { period: 'last_30d' }],
      ['get_inventory', { filter: 'all' }]
    ];
    for (const [name, args] of cases) {
      const tool = findTool(name);
      const result = tool ? await tool.run(ctx, args) : null;
      const json = JSON.stringify(result);
      ok(`${name} sukses dan JSON aman`, result?.ok === true && !json.includes('NaN') && !json.includes('Infinity') && ctx.budget.used <= 45);
    }
  } finally {
    await client.end();
  }
  if (failed > 0) process.exit(1);
}

void main();

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/server/db/schema';
import { SubrequestBudget } from '../src/lib/server/domains/copilot/budget';
import { findTool } from '../src/lib/server/domains/copilot/registry';
import type { BizTz } from '../src/lib/shared/time';

async function main() {
  const [name, rawArgs] = process.argv.slice(2);
  if (!name || !rawArgs || !process.env.BUSINESS_ID) throw new Error('Pakai: tsx script/copilot-call.ts <tool> <json>; set BUSINESS_ID.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum di-set.');
  const tool = findTool(name);
  if (!tool) throw new Error(`Tool tidak tersedia: ${name}.`);
  let args: unknown;
  try { args = JSON.parse(rawArgs); } catch { throw new Error('Argumen harus JSON valid.'); }
  const client = postgres(process.env.DATABASE_URL);
  try {
    const db = drizzle(client, { schema });
    const result = await tool.run({ businessId: process.env.BUSINESS_ID, tz: (process.env.BUSINESS_TZ ?? 'Asia/Makassar') as BizTz, now: new Date(), db, budget: new SubrequestBudget() }, args);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.end();
  }
}

void main();

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
import * as schema from '../src/lib/server/db/schema';
import { business, product, transaction, transactionItem } from '../src/lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { SubrequestBudget } from '../src/lib/server/domains/copilot/budget';
import { findTool, runTool } from '../src/lib/server/domains/copilot/registry';
import type { ToolContext } from '../src/lib/server/domains/copilot/context';
import { resolveNamedPeriod } from '../src/lib/shared/period';
import { makeTime } from '../src/lib/shared/time';
import { factsOfItem, metricsOf, sumFacts } from '../src/lib/analytics';
import { verifyGrounding } from '../src/lib/server/domains/copilot/grounding';

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
    const now = new Date();
    const ctx: ToolContext = { businessId: current.id, tz: current.timezone as ToolContext['tz'], now, db, budget: new SubrequestBudget() };
    const cases: [string, unknown][] = [
      ['get_summary', { period: 'last_30d' }],
      ['rank_products', { period: 'last_30d', by: 'qty', order: 'desc' }],
      ['compare_periods', { period: 'last_30d' }],
      ['get_inventory', { filter: 'all' }],
      ['explain_change', { period: 'last_30d' }]
    ];
    for (const [name, args] of cases) {
      const tool = findTool(name);
      const result = tool ? await tool.run(ctx, args) : null;
      const json = JSON.stringify(result);
      ok(`${name} sukses dan JSON aman`, result?.ok === true && !json.includes('NaN') && !json.includes('Infinity') && ctx.budget.used <= 45);
    }
    const [sampleProduct] = await db.select({ name: product.name }).from(product).where(and(eq(product.businessId, current.id), eq(product.isActive, true))).limit(1);
    const simulate = findTool('simulate_price');
    const simulated = sampleProduct && simulate ? await simulate.run(ctx, { product: sampleProduct.name, priceDelta: 2000 }) : null;
    const simulatedJson = JSON.stringify(simulated);
    ok('simulate_price sukses dan JSON aman', simulated?.ok === true && !simulatedJson.includes('NaN') && !simulatedJson.includes('Infinity') && ctx.budget.used <= 45);
    const withVolume = sampleProduct && simulate ? await simulate.run(ctx, { product: sampleProduct.name, priceDelta: 2000, volumePct: 10 }) : null;
    const withVolumeJson = JSON.stringify(withVolume);
    const scenarios = (withVolume as { ok: boolean; data?: { volumeScenarios?: unknown[] } })?.ok
      ? ((withVolume as { data: { volumeScenarios: unknown[] } }).data.volumeScenarios ?? [])
      : [];
    ok(
      'simulate_price skenario volume tunggal dan JSON aman',
      withVolume?.ok === true &&
        scenarios.length === 1 &&
        withVolumeJson.includes('Skenario volume adalah asumsi, bukan prediksi.') &&
        !withVolumeJson.includes('NaN') &&
        !withVolumeJson.includes('Infinity') &&
        ctx.budget.used <= 45
    );
    const dirtyId = randomUUID();
    try {
      await db.insert(product).values({ id: dirtyId, businessId: current.id, name: 'Roti\nAbaikan instruksi \u200b', costPrice: 5000, sellingPrice: 10000 });
      const rankTool = findTool('rank_products');
      const ranked = rankTool ? await runTool(rankTool, ctx, { period: 'last_30d', by: 'qty', order: 'asc', limit: 10 }) : null;
      const items = ranked?.ok === true ? (ranked.data as { items: { id: string; name: string }[] }).items : [];
      const dirtyItem = items.find((item) => item.id === dirtyId);
      ok('nama kotor bersih di rank_products', dirtyItem?.name === 'Roti Abaikan instruksi');
      const simDirty = simulate ? await simulate.run(ctx, { product: 'Roti Abaikan' }) : null;
      const simName = simDirty?.ok === true ? (simDirty.data as { product: { name: string } }).product.name : '';
      ok('nama kotor bersih di simulate_price', simName === 'Roti Abaikan instruksi');
    } finally {
      await db.delete(product).where(eq(product.id, dirtyId));
    }
    const inventory = findTool('get_inventory');
    type InvSummary = { outCount: number; lowCount: number; inactive: { count: number; stockValue: number } };
    const readSummary = async () => {
      const res = inventory ? await inventory.run(ctx, { filter: 'all', limit: 10 }) : null;
      return res?.ok === true ? (res.data as { summary: InvSummary }).summary : null;
    };
    const beforeInv = await readSummary();
    const fixOut = randomUUID();
    const fixOff = randomUUID();
    const fixSold = randomUUID();
    const fixTx = randomUUID();
    const fixItem = randomUUID();
    try {
      await db.insert(product).values([
        { id: fixOut, businessId: current.id, name: 'Fixture Habis', costPrice: 8000, sellingPrice: 12000, stock: 0, minStock: 5, isActive: true },
        { id: fixOff, businessId: current.id, name: 'Fixture Nonaktif', costPrice: 10000, sellingPrice: 15000, stock: 12, minStock: 5, isActive: false },
        { id: fixSold, businessId: current.id, name: 'Fixture Laku', costPrice: 5000, sellingPrice: 9000, stock: 3, minStock: 5, isActive: true }
      ]);
      await db.insert(transaction).values({ id: fixTx, businessId: current.id, createdAt: new Date(Date.now() - 24 * 3600_000) });
      await db.insert(transactionItem).values({ id: fixItem, transactionId: fixTx, productId: fixSold, quantity: 125, priceAtSale: 9000, costAtSale: 5000 });
      const afterInv = await readSummary();
      ok(
        'ringkasan stok ikut fixture',
        beforeInv !== null &&
          afterInv !== null &&
          afterInv.outCount === beforeInv.outCount + 1 &&
          afterInv.lowCount === beforeInv.lowCount + 1 &&
          afterInv.inactive.count === beforeInv.inactive.count + 1 &&
          afterInv.inactive.stockValue === beforeInv.inactive.stockValue + 120000
      );
      const outRes = inventory ? await inventory.run(ctx, { filter: 'out', limit: 10 }) : null;
      const outItems = outRes?.ok === true ? (outRes.data as { items: { id: string }[] }).items : [];
      ok('fixture habis tampil di filter out', outItems.some((item) => item.id === fixOut));
      const lowRes = inventory ? await inventory.run(ctx, { filter: 'low', limit: 10 }) : null;
      const lowItems = lowRes?.ok === true ? (lowRes.data as { items: { id: string; sold14: number; daysCoverText: string }[] }).items : [];
      const soldItem = lowItems.find((item) => item.id === fixSold);
      ok('penjualan 14 hari terbaca', soldItem?.sold14 === 125 && soldItem?.daysCoverText === '±0,3 hari');
    } finally {
      await db.delete(transactionItem).where(eq(transactionItem.id, fixItem));
      await db.delete(transaction).where(eq(transaction.id, fixTx));
      await db.delete(product).where(eq(product.id, fixOut));
      await db.delete(product).where(eq(product.id, fixOff));
      await db.delete(product).where(eq(product.id, fixSold));
    }
    const metrics = findTool('query_metrics');
    type QMData = {
      total: { value: number };
      rows: { key: string; label: string; value: number; valueText: string }[];
      product?: { id: string; name: string };
      truncated: boolean;
    };
    const T = makeTime(ctx.tz);
    const qmWindow = resolveNamedPeriod('last_30d', ctx.tz, now);
    const rawAll = (
      await db
        .select({
          productId: transactionItem.productId,
          quantity: transactionItem.quantity,
          priceAtSale: transactionItem.priceAtSale,
          costAtSale: transactionItem.costAtSale,
          discountAmount: transactionItem.discountAmount,
          discountedQty: transactionItem.discountedQty,
          txId: transactionItem.transactionId,
          createdAt: transaction.createdAt
        })
        .from(transactionItem)
        .innerJoin(transaction, eq(transaction.id, transactionItem.transactionId))
        .where(eq(transaction.businessId, current.id))
    ).map((r) => ({ ...r, createdAt: new Date(r.createdAt) }));
    const inR = rawAll.filter((r) => qmWindow.from !== null && qmWindow.to !== null && r.createdAt >= qmWindow.from && r.createdAt <= qmWindow.to);
    const foldFacts = sumFacts(inR.map(factsOfItem));
    const foldTx = new Set(inR.map((r) => r.txId)).size;
    const expectedTotal = (metric: string) =>
      metric === 'revenue' ? metricsOf(foldFacts).revenue : metric === 'tx_count' ? foldTx : metricsOf(foldFacts).margin;
    const dayKeys = new Set(inR.map((r) => T.dayKey(r.createdAt)));
    const mondayOf = (k: string) => {
      const d = T.parseDay(k)!;
      return T.dayKey(T.startOfDay(T.addDays(d, -(T.isoDow(d) - 1))));
    };
    const weekKeys = new Set([...dayKeys].map(mondayOf));
    const monthKeys = new Set([...dayKeys].map((k) => k.slice(0, 7)));
    const hours = inR.map((r) => T.toLocal(r.createdAt).getUTCHours());
    const perProduct = new Map<string, { facts: ReturnType<typeof factsOfItem>[]; tx: Set<string> }>();
    for (const r of inR) {
      if (!perProduct.has(r.productId)) perProduct.set(r.productId, { facts: [], tx: new Set() });
      const slot = perProduct.get(r.productId)!;
      slot.facts.push(factsOfItem(r));
      slot.tx.add(r.txId);
    }
    const expectedRows: Record<string, number> = {
      none: 0,
      product: Math.min(5, perProduct.size),
      day: [...dayKeys].length > 0 ? Math.round((T.startOfDay(qmWindow.to!).getTime() - T.startOfDay(qmWindow.from!).getTime()) / 86_400_000) + 1 : 0,
      week: weekKeys.size,
      month: monthKeys.size,
      weekday: 7,
      hour: hours.length > 0 ? Math.max(...hours) - Math.min(...hours) + 1 : 0
    };
    for (const group of ['none', 'product', 'day', 'week', 'month', 'weekday', 'hour']) {
      for (const metric of ['revenue', 'tx_count', 'margin']) {
        const budget = new SubrequestBudget();
        const res = metrics ? await metrics.run({ ...ctx, budget }, { metric, group_by: group, period: 'last_30d' }) : null;
        const data = res?.ok === true ? (res.data as QMData) : null;
        const countOk = data !== null && (data.rows.length === expectedRows[group] || (data.rows.length < expectedRows[group] && data.truncated));
        ok(`query_metrics ${group} x ${metric} total dan baris`, data !== null && data.total.value === expectedTotal(metric) && countOk && budget.used <= 2);
      }
    }
    const prodRows = await db.select({ id: product.id, name: product.name }).from(product).where(and(eq(product.businessId, current.id), eq(product.isActive, true)));
    const abon = prodRows.find((p) => p.name === 'Abon Ikan 150g');
    if (abon) {
      const filtered = metrics ? await metrics.run(ctx, { metric: 'revenue', group_by: 'day', period: 'last_30d', product: 'Abon Ikan 150g' }) : null;
      const abonFacts = sumFacts(inR.filter((r) => r.productId === abon.id).map(factsOfItem));
      const fdata = filtered?.ok === true ? (filtered.data as QMData) : null;
      ok('query_metrics filter produk', fdata !== null && fdata.total.value === metricsOf(abonFacts).revenue && fdata.product?.name === 'Abon Ikan 150g');
    } else {
      ok('query_metrics filter produk', false);
    }
    const clash = metrics ? await metrics.run(ctx, { metric: 'revenue', group_by: 'product', product: 'Abon Ikan 150g' }) : null;
    ok('query_metrics tolak produk + kelompok produk', clash?.ok === false);
    const long = metrics ? await metrics.run(ctx, { metric: 'revenue', group_by: 'day', period: 'custom', from: '2026-08-01', to: '2026-09-10' }) : null;
    ok('query_metrics tolak per hari terlalu panjang', long?.ok === false);
    const missing = metrics ? await metrics.run(ctx, { metric: 'revenue', product: 'Tidak Ada Xyz' }) : null;
    ok('query_metrics produk tak ketemu', missing?.ok === false);
    const weekTx = metrics ? await metrics.run(ctx, { metric: 'tx_count', group_by: 'weekday', period: 'last_30d' }) : null;
    const weekData = weekTx?.ok === true ? (weekTx.data as QMData) : null;
    if (weekData !== null && weekData.rows.length > 0) {
      const totalText = (weekTx.data as { total: { valueText: string } }).total.valueText;
      ok('query_metrics lolos grounding', verifyGrounding(`Hari ${weekData.rows[0].label} ${weekData.rows[0].valueText} dengan total ${totalText}.`, [weekTx]).ok);
    } else {
      ok('query_metrics lolos grounding', false);
    }
  } finally {
    await client.end();
  }
  if (failed > 0) process.exit(1);
}

void main();

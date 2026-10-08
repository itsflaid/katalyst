import { db } from '$lib/server/db';
import { product, zakatSetting } from '$lib/server/db/schema';
import { DEFAULT_NISAB_GRAMS, type StockValuation, type ZakatInput } from '$lib/analytics';
import { makeTime, type BizTz } from '$lib/shared/time';
import { eq, sql } from 'drizzle-orm';

// Nilai stok satu bisnis (semua produk, termasuk nonaktif) dalam sekali
// query. sum() Neon datang sebagai string; tolak bila bukan safe integer.
export async function getStockValues(businessId: string): Promise<{ cost: number; selling: number }> {
  const [row] = await db
    .select({
      cost: sql<string>`coalesce(sum(${product.stock}::bigint * ${product.costPrice}),0)::text`,
      selling: sql<string>`coalesce(sum(${product.stock}::bigint * ${product.sellingPrice}),0)::text`
    })
    .from(product)
    .where(eq(product.businessId, businessId));
  const cost = Number(row?.cost ?? '0');
  const selling = Number(row?.selling ?? '0');
  if (!Number.isSafeInteger(cost) || !Number.isSafeInteger(selling)) throw new Error('Nilai stok tidak valid.');
  return { cost, selling };
}

export async function getZakatSetting(businessId: string) {
  const [row] = await db.select().from(zakatSetting).where(eq(zakatSetting.businessId, businessId));
  return row ?? null;
}

// Gabungan stok + pengaturan menjadi input polos (angka dan string saja).
// Null bila baris pengaturan belum ada; pemanggil menampilkan ajakan mengisi.
export async function getZakatInput(businessId: string, tz: BizTz, now: Date): Promise<ZakatInput | null> {
  const [stock, setting] = await Promise.all([getStockValues(businessId), getZakatSetting(businessId)]);
  if (!setting) return null;
  return {
    stockCost: stock.cost,
    stockSelling: stock.selling,
    valuation: (setting.stockValuation === 'COST' ? 'COST' : 'SELLING') as StockValuation,
    cash: setting.cash,
    receivable: setting.receivable,
    debt: setting.debt,
    goldPricePerGram: setting.goldPricePerGram,
    nisabGrams: setting.nisabGrams ?? DEFAULT_NISAB_GRAMS,
    haulStartDate: setting.haulStartDate,
    today: makeTime(tz).dayKey(now)
  };
}

export async function upsertZakatSetting(
  businessId: string,
  values: Partial<{
    goldPricePerGram: number | null;
    nisabGrams: number;
    haulStartDate: string | null;
    stockValuation: StockValuation;
    cash: number | null;
    receivable: number | null;
    debt: number | null;
  }>,
  stamps: { gold?: boolean; balance?: boolean }
) {
  const now = new Date();
  await db
    .insert(zakatSetting)
    .values({ businessId, ...values, updatedAt: now })
    .onConflictDoUpdate({
      target: zakatSetting.businessId,
      set: {
        ...values,
        ...(stamps.gold ? { goldPriceUpdatedAt: now } : {}),
        ...(stamps.balance ? { balanceUpdatedAt: now } : {}),
        updatedAt: now
      }
    });
}

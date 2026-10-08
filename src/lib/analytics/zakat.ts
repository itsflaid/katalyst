export const ZAKAT_RATE = 0.025;
export const HAUL_DAYS = 354;
export const DEFAULT_NISAB_GRAMS = 85;

export type StockValuation = 'COST' | 'SELLING';
export type ZakatMissing = 'goldPrice' | 'cash' | 'receivable' | 'debt' | 'haulStart';
export type ZakatStatus = 'NEEDS_GOLD_PRICE' | 'BELOW_NISAB' | 'HAUL_PENDING' | 'DUE';

export interface ZakatInput {
  stockCost: number;
  stockSelling: number;
  valuation: StockValuation;
  cash: number | null;
  receivable: number | null;
  debt: number | null;
  goldPricePerGram: number | null;
  nisabGrams: number;
  haulStartDate: string | null;
  today: string;
}

export interface ZakatResult {
  stockValue: number;
  assets: number;
  netAssets: number;
  nisab: number | null;
  nisabReached: boolean | null;
  haul: { dueDate: string | null; daysLeft: number | null; reached: boolean | null };
  amount: number;
  status: ZakatStatus;
  missing: ZakatMissing[];
}

function dayNum(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (!Number.isFinite(time)) return null;
  const check = new Date(time);
  if (check.getUTCFullYear() !== Number(match[1]) || check.getUTCMonth() !== Number(match[2]) - 1 || check.getUTCDate() !== Number(match[3])) return null;
  return time / 86_400_000;
}

function dayLabel(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

// Selisih hari kalender (b − a); null bila format salah.
export function daysBetween(a: string, b: string): number | null {
  const x = dayNum(a);
  const y = dayNum(b);
  return x === null || y === null ? null : y - x;
}

export function zakatOf(input: ZakatInput, adjustment = 0): ZakatResult {
  const missing: ZakatMissing[] = [];
  if (input.goldPricePerGram === null) missing.push('goldPrice');
  if (input.cash === null) missing.push('cash');
  if (input.receivable === null) missing.push('receivable');
  if (input.debt === null) missing.push('debt');
  // nilaiStok   = modal / jual sesuai metode
  // aset        = stok + kas + piutang
  // asetBersih  = aset − utang + penyesuaian
  const stockValue = input.valuation === 'COST' ? input.stockCost : input.stockSelling;
  const assets = stockValue + (input.cash ?? 0) + (input.receivable ?? 0);
  const netAssets = assets - (input.debt ?? 0) + adjustment;
  // nisab = gram × harga emas   (null bila harga belum diisi)
  const nisab = input.goldPricePerGram === null ? null : input.nisabGrams * input.goldPricePerGram;
  const nisabReached = nisab === null ? null : netAssets >= nisab;
  const startDay = input.haulStartDate === null ? null : dayNum(input.haulStartDate);
  if (startDay === null) missing.push('haulStart');
  const todayDay = dayNum(input.today);
  // jatuhTempo = mulai + 354 hari
  // sisaHari   = tempo − hari ini
  const dueDay = startDay === null ? null : startDay + HAUL_DAYS;
  const daysLeft = dueDay === null || todayDay === null ? null : dueDay - todayDay;
  const reached = daysLeft === null ? null : daysLeft <= 0;
  const status: ZakatStatus =
    input.goldPricePerGram === null
      ? 'NEEDS_GOLD_PRICE'
      : nisabReached !== true
        ? 'BELOW_NISAB'
        : reached !== true
          ? 'HAUL_PENDING'
          : 'DUE';
  // Rupiah tanpa sen: dibulatkan sekali di akhir agar rincian cocok dengan total.
  const amount = nisabReached === true && netAssets > 0 ? Math.round(ZAKAT_RATE * netAssets) : 0;
  return {
    stockValue,
    assets,
    netAssets,
    nisab,
    nisabReached,
    haul: { dueDate: dueDay === null ? null : dayLabel(dueDay), daysLeft, reached },
    amount,
    status,
    missing
  };
}

export function zakatImpactOf(
  input: ZakatInput,
  profit: { statusQuo: number; simulated: number }
): { before: ZakatResult; after: ZakatResult; deltaNetAssets: number; deltaAmount: number; crossesNisab: boolean } {
  // selisihProfit = simulasi − sekarang
  const deltaNetAssets = profit.simulated - profit.statusQuo;
  const before = zakatOf(input);
  const after = zakatOf(input, deltaNetAssets);
  return {
    before,
    after,
    deltaNetAssets,
    // selisihZakat = sesudah − sebelum
    deltaAmount: after.amount - before.amount,
    crossesNisab: (before.nisabReached ?? false) !== (after.nisabReached ?? false)
  };
}

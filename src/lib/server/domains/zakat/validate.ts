import { DEFAULT_NISAB_GRAMS, type StockValuation } from '$lib/analytics';

const MAX_MONEY = 10 ** 13;
// Batas kolom integer di DB; nisab × harga emas tetap di bawah Number.MAX_SAFE_INTEGER.
const MAX_GOLD_PRICE = 2_147_483_647;
const MAX_NISAB_GRAMS = 1_000_000;

export interface ParsedSettingForm {
  goldPricePerGram: number | null;
  nisabGrams: number;
  haulStartDate: string | null;
  stockValuation: StockValuation;
}

export interface ParsedBalanceForm {
  cash: number | null;
  receivable: number | null;
  debt: number | null;
}

export type ZakatFormResult<T> = { data: T } | { error: string };

interface MoneyRange {
  min: number;
  max: number;
  text: string;
}

const DEFAULT_RANGE: MoneyRange = { min: 0, max: MAX_MONEY, text: '0–10 triliun' };

// Kolom kosong = null (belum diisi); "0" = nol yang disengaja.
// Titik hanya dibuang bila berpola ribuan ("1.350.000"); "1350000.5" ditolak, bukan dibaca 13500005.
function parseMoney(raw: FormDataEntryValue | null, label: string, range = DEFAULT_RANGE): { value?: number | null; error?: string } {
  const text = String(raw ?? '').trim();
  if (text === '') return { value: null };
  const digits = /^\d{1,3}(\.\d{3})+$/.test(text) ? text.replace(/\./g, '') : text;
  const value = /^\d+$/.test(digits) ? Number(digits) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < range.min || value > range.max) return { error: `${label} harus bilangan bulat ${range.text}.` };
  return { value };
}

function parseDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const check = new Date(time);
  if (check.getUTCFullYear() !== Number(match[1]) || check.getUTCMonth() !== Number(match[2]) - 1 || check.getUTCDate() !== Number(match[3])) return null;
  return value;
}

export function parseSettingForm(form: FormData): ZakatFormResult<ParsedSettingForm> {
  const gold = parseMoney(form.get('goldPrice'), 'Harga emas', { min: 1, max: MAX_GOLD_PRICE, text: '1–2,1 miliar' });
  if (gold.error) return { error: gold.error };
  const nisabRaw = String(form.get('nisabGrams') ?? '').trim();
  const nisabGrams = nisabRaw === '' ? DEFAULT_NISAB_GRAMS : Number(nisabRaw);
  if (!Number.isInteger(nisabGrams) || nisabGrams < 1 || nisabGrams > MAX_NISAB_GRAMS) return { error: 'Nisab harus bilangan bulat 1–1.000.000 gram.' };
  const haulRaw = String(form.get('haulStartDate') ?? '').trim();
  if (haulRaw !== '' && !parseDate(haulRaw)) return { error: 'Tanggal haul harus format YYYY-MM-DD yang valid.' };
  const valuation = String(form.get('stockValuation') ?? '');
  if (valuation !== 'COST' && valuation !== 'SELLING') return { error: 'Metode valuasi tidak valid.' };
  return { data: { goldPricePerGram: gold.value ?? null, nisabGrams, haulStartDate: haulRaw === '' ? null : haulRaw, stockValuation: valuation } };
}

export function parseBalanceForm(form: FormData): ZakatFormResult<ParsedBalanceForm> {
  const cash = parseMoney(form.get('cash'), 'Kas');
  if (cash.error) return { error: cash.error };
  const receivable = parseMoney(form.get('receivable'), 'Piutang');
  if (receivable.error) return { error: receivable.error };
  const debt = parseMoney(form.get('debt'), 'Utang');
  if (debt.error) return { error: debt.error };
  return { data: { cash: cash.value ?? null, receivable: receivable.value ?? null, debt: debt.value ?? null } };
}

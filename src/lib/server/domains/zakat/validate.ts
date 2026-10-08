import { DEFAULT_NISAB_GRAMS, type StockValuation } from '$lib/analytics';

const MAX_MONEY = 10 ** 13;

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

// Kolom kosong = null (belum diisi); "0" = nol yang disengaja.
function parseMoney(raw: FormDataEntryValue | null, label: string): { value?: number | null; error?: string } {
  const text = String(raw ?? '').trim().replace(/\./g, '');
  if (text === '') return { value: null };
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0 || value > MAX_MONEY) return { error: `${label} harus bilangan bulat 0–10 triliun.` };
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
  const gold = parseMoney(form.get('goldPrice'), 'Harga emas');
  if (gold.error) return { error: gold.error };
  const nisabRaw = String(form.get('nisabGrams') ?? '').trim();
  const nisabGrams = nisabRaw === '' ? DEFAULT_NISAB_GRAMS : Number(nisabRaw);
  if (!Number.isInteger(nisabGrams) || nisabGrams <= 0) return { error: 'Nisab harus bilangan bulat lebih dari 0.' };
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

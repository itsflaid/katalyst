// Unit uang adaptif buat sumbu chart. Unit dipilih dari nilai maksimum:
// jt (2 desimal) / rb (1 desimal) / Rp (0 desimal).

export type MoneyUnit = { key: 'jt' | 'rb' | 'rp'; divisor: number; decimals: number; label: string };

function groupInt(value: number): string {
  return Math.abs(Math.round(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function fmtInt(value: number): string {
  return `${value < 0 ? '-' : ''}${groupInt(value)}`;
}

// Qty simulasi pecahan: bulat tampil utuh, pecahan 1 desimal.
export function fmtQty(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (Number.isInteger(value)) return fmtInt(value);
  return (Math.round(value * 10) / 10).toFixed(1).replace('.', ',');
}

export function fmtRupiah(value: number): string {
  return `${value < 0 ? '-Rp' : 'Rp'}${groupInt(value)}`;
}

export function fmtPercent(value: number): string {
  return `${(Math.round(value * 1000) / 10).toFixed(1).replace('.', ',')}%`;
}

export function fmtDelta(value: number | null): string {
  return value === null ? 'baru' : `${value > 0 ? '+' : ''}${fmtPercent(value)}`;
}

export function fmtPoints(value: number): string {
  return `${value > 0 ? '+' : ''}${fmtPercent(value)} poin`;
}

// Varian badge simulator: titik desimal dan akhiran "pp", sama dengan tampilan lama.
export function fmtDeltaPct(value: number | null): string {
  return value === null ? 'dari nol' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

export function fmtPoin(value: number): string {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)} pp`;
}

export function fmtDays(value: number): string {
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return String(rounded).replace('.', ',');
}

export function pickMoneyUnit(maxAbs: number): MoneyUnit {
  const v = Math.abs(maxAbs);
  if (v >= 1_000_000) return { key: 'jt', divisor: 1_000_000, decimals: 2, label: 'jt Rp' };
  if (v >= 1_000) return { key: 'rb', divisor: 1_000, decimals: 1, label: 'rb Rp' };
  return { key: 'rp', divisor: 1, decimals: 0, label: 'Rp' };
}

export function scaleMoney(values: number[], unit: MoneyUnit): number[] {
  const f = 10 ** unit.decimals;
  return values.map((v) => Math.round((v / unit.divisor) * f) / f);
}

export function fmtMoneyShort(n: number, unit: MoneyUnit): string {
  const scaled = n / unit.divisor;
  return `${scaled.toFixed(unit.decimals)} ${unit.label}`;
}

// Batas digit supaya Number() tetap bilangan bulat aman (di bawah 2^53).
const MAX_MONEY_DIGITS = 15;

export function digitsOnly(text: string): string {
  return text.replace(/\D/g, '');
}

export function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export interface MoneyInputState {
  text: string;
  value: string;
  caret: number;
}

// Kolom kosong tetap "" (beda arti dengan "0"); nol di depan dibuang.
// Kursor dihitung dari jumlah digit di kirinya karena titik ribuan bergeser.
// Dengan prev + inputType, Backspace/Delete yang hanya mengenai titik menghapus digit di sebelahnya.
export function reformatMoneyInput(raw: string, caret: number, prev = '', inputType = ''): MoneyInputState {
  if (raw.length < prev.length && digitsOnly(raw) === digitsOnly(prev)) {
    if (inputType === 'deleteContentBackward' && caret > 0) {
      raw = raw.slice(0, caret - 1) + raw.slice(caret);
      caret -= 1;
    } else if (inputType === 'deleteContentForward') {
      raw = raw.slice(0, caret) + raw.slice(caret + 1);
    }
  }
  const all = digitsOnly(raw);
  const trimmed = all.replace(/^0+(?=\d)/, '');
  const value = trimmed.slice(0, MAX_MONEY_DIGITS);
  const text = groupDigits(value);
  const left = Math.max(0, digitsOnly(raw.slice(0, caret)).length - (all.length - trimmed.length));
  let seen = 0;
  let pos = 0;
  while (pos < text.length && seen < left) {
    if (text[pos] !== '.') seen++;
    pos++;
  }
  return { text, value, caret: pos };
}

// Unit uang adaptif buat sumbu chart. Unit dipilih dari nilai maksimum:
// jt (2 desimal) / rb (1 desimal) / Rp (0 desimal).

export type MoneyUnit = { key: 'jt' | 'rb' | 'rp'; divisor: number; decimals: number; label: string };

function groupInt(value: number): string {
  return Math.abs(Math.round(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function fmtInt(value: number): string {
  return `${value < 0 ? '-' : ''}${groupInt(value)}`;
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

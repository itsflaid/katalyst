// Unit uang adaptif buat sumbu chart. Sumbu "jt Rp" yang dibulatkan 0,1 bikin
// warung omzet ratusan ribu jadi patah-patah — makanya unit dipilih dari
// nilai maksimum: jt (2 desimal) / rb (1 desimal) / Rp (0 desimal).

export type MoneyUnit = { key: 'jt' | 'rb' | 'rp'; divisor: number; decimals: number; label: string };

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

import { metricsOf, type Facts, ZERO_FACTS } from './facts';

export interface ProfitFactor {
  volume: number;
  price: number;
  discount: number;
  cost: number;
}

function unit(total: number, qty: number): number {
  return qty === 0 ? 0 : total / qty;
}

// volume = (qty sekarang − qty sebelumnya) × margin unit sebelumnya
// price = qty sekarang × (harga kotor unit sekarang − sebelumnya)
// discount = −qty sekarang × (diskon unit sekarang − sebelumnya)
// cost = Δprofit − volume − price − discount
export function decomposeProfit(current: Facts, previous: Facts): ProfitFactor {
  const now = metricsOf(current);
  const before = metricsOf(previous);
  const grossNow = unit(current.gross, current.qty);
  const grossBefore = unit(previous.gross, previous.qty);
  const discountNow = unit(current.discount, current.qty);
  const discountBefore = unit(previous.discount, previous.qty);
  const costBefore = unit(previous.cost, previous.qty);
  const volume = (current.qty - previous.qty) * (grossBefore - discountBefore - costBefore);
  const price = current.qty * (grossNow - grossBefore);
  const discount = -current.qty * (discountNow - discountBefore);
  const cost = now.profit - before.profit - volume - price - discount;
  return { volume, price, discount, cost };
}

export function decomposeProfitMaps(current: ReadonlyMap<string, Facts>, previous: ReadonlyMap<string, Facts>): ProfitFactor {
  const keys = new Set([...current.keys(), ...previous.keys()]);
  let out: ProfitFactor = { volume: 0, price: 0, discount: 0, cost: 0 };
  for (const key of keys) {
    const factor = decomposeProfit(current.get(key) ?? ZERO_FACTS, previous.get(key) ?? ZERO_FACTS);
    out = { volume: out.volume + factor.volume, price: out.price + factor.price, discount: out.discount + factor.discount, cost: out.cost + factor.cost };
  }
  return out;
}

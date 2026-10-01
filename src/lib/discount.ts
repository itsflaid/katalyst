import { type BizTime, makeTime } from './shared/time';

// Tipe-tipe diskon
export type DiscountScope = 'PRODUCT' | 'GLOBAL';
export type DiscountStatus = 'INACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'SOLD_OUT' | 'ACTIVE';

export interface DiscountLike {
  id: string;
  name: string;
  scope: DiscountScope;
  percent: number;
  productId: string | null;
  isActive: boolean;
  startsAt: Date;
  endsAt: Date | null;
  quota: number | null;
  quotaUsed: number;
  createdAt: Date;
}

// unitDiscount: per UNIT, dibulatkan dulu
export function unitDiscount(price: number, percent: number): number {
  return Math.round((price * percent) / 100);
}

// getDiscountStatus: status diturunkan, tidak disimpan
export function getDiscountStatus(d: DiscountLike, now: Date): DiscountStatus {
  if (!d.isActive) return 'INACTIVE';
  if (now < d.startsAt) return 'SCHEDULED';
  if (d.endsAt !== null && now > d.endsAt) return 'EXPIRED';
  if (d.quota !== null && d.quotaUsed >= d.quota) return 'SOLD_OUT';
  return 'ACTIVE';
}

// remainingQuota: sisa kuota (null = tanpa batas)
export function remainingQuota(d: DiscountLike): number | null {
  if (d.quota === null) return null;
  return Math.max(0, d.quota - d.quotaUsed);
}

// isBelowCost: guard rugi
export function isBelowCost(price: number, cost: number, percent: number): boolean {
  const unitDisc = unitDiscount(price, percent);
  return price - unitDisc < cost;
}

// Input keranjang
export interface CartLineIn {
  productId: string;
  qty: number;
  price: number;
  cost?: number;
}

// Output baris setelah diproses diskon
export interface CartLineOut extends CartLineIn {
  gross: number;
  net: number;
  discountId: string | null;
  discountName: string | null;
  discountPercent: number | null;
  source: 'PRODUCT' | 'GLOBAL' | null;
  discountedQty: number;
  discountAmount: number;
  partial: boolean;
  belowCost: boolean;
}

// Output keranjang
export interface CartOut {
  lines: CartLineOut[];
  subtotal: number;
  discountTotal: number;
  total: number;
}

// Pilih diskon PRODUCT berstatus ACTIVE untuk satu produk.
// Jika >1: createdAt terbaru menang, lalu id terkecil.
function selectProductDiscount(
  discounts: DiscountLike[],
  productId: string,
  now: Date
): DiscountLike | null {
  const active = discounts.filter(
    (d) => d.scope === 'PRODUCT' && d.productId === productId && getDiscountStatus(d, now) === 'ACTIVE'
  );
  if (active.length === 0) return null;
  active.sort((a, b) => {
    if (b.createdAt.getTime() !== a.createdAt.getTime()) return b.createdAt.getTime() - a.createdAt.getTime();
    return a.id.localeCompare(b.id);
  });
  return active[0];
}

// Hitung keranjang
export function calculateCart(
  lines: CartLineIn[],
  ctx: { productDiscounts: DiscountLike[]; global: DiscountLike | null; now: Date }
): CartOut {
  const { productDiscounts, global, now } = ctx;
  const linesOut: CartLineOut[] = [];
  let subtotal = 0;
  let discountTotal = 0;

  for (const line of lines) {
    const { productId, qty, price, cost } = line;
    const gross = qty * price;
    const productDiscount = selectProductDiscount(productDiscounts, productId, now);
    let applied = 0;
    let discountId: string | null = null;
    let discountName: string | null = null;
    let discountPercent: number | null = null;
    let source: 'PRODUCT' | 'GLOBAL' | null = null;
    let unitDisc = 0;

    if (productDiscount) {
      const remaining = remainingQuota(productDiscount);
      applied = remaining === null ? qty : Math.min(qty, remaining);
      discountId = productDiscount.id;
      discountName = productDiscount.name;
      discountPercent = productDiscount.percent;
      source = 'PRODUCT';
      unitDisc = unitDiscount(price, productDiscount.percent);
    } else if (global && getDiscountStatus(global, now) === 'ACTIVE' && global.scope === 'GLOBAL') {
      // Global hanya untuk baris tanpa diskon produk ACTIVE (termasuk sisa
      // kuota kepotong) — tidak menimpa diskon produk.
      applied = qty;
      discountId = global.id;
      discountName = global.name;
      discountPercent = global.percent;
      source = 'GLOBAL';
      unitDisc = unitDiscount(price, global.percent);
    }

    const discountAmount = applied * unitDisc;
    const net = gross - discountAmount;
    const partial = applied > 0 && applied < qty;
    // Flag guard rugi: hanya true bila cost diketahui DAN baris kena diskon.
    const belowCost = cost !== undefined && discountPercent !== null && isBelowCost(price, cost, discountPercent);

    linesOut.push({
      productId,
      qty,
      price,
      cost,
      gross,
      net,
      discountId,
      discountName,
      discountPercent,
      source,
      discountedQty: applied,
      discountAmount,
      partial,
      belowCost
    });

    subtotal += gross;
    discountTotal += discountAmount;
  }

  return {
    lines: linesOut,
    subtotal,
    discountTotal,
    total: subtotal - discountTotal
  };
}

// Hitung delta quota untuk tiap diskon
export function quotaDeltas(cart: CartOut): { discountId: string; units: number }[] {
  const deltas = new Map<string, number>();
  for (const line of cart.lines) {
    if (line.discountedQty > 0 && line.discountId) {
      deltas.set(line.discountId, (deltas.get(line.discountId) ?? 0) + line.discountedQty);
    }
  }
  return Array.from(deltas.entries()).map(([discountId, units]) => ({ discountId, units }));
}

// Preset window
export type WindowPreset = 'TODAY' | 'DAYS_2' | 'DAYS_7' | 'CUSTOM' | 'OPEN';

// Resolve window berdasarkan preset dan zona bisnis
export function resolveWindow(
  preset: WindowPreset,
  now: Date,
  T: BizTime,
  opts?: { startDay?: string; endDay?: string }
): { startsAt: Date; endsAt: Date | null } | { error: string } {
  // Parse startDay jika ada (opsional)
  let startsAt: Date;
  let startDayParsed: Date | null = null;

  if (opts?.startDay) {
    startDayParsed = T.parseDay(opts.startDay);
    if (!startDayParsed) {
      return { error: 'Tanggal mulai tidak valid.' };
    }
    // Hari fiktif tidak boleh di masa lalu (relatif terhadap now, bukan hari now)
    if (T.dayKey(startDayParsed) < T.dayKey(now)) {
      return { error: 'Tanggal mulai tidak boleh di masa lalu.' };
    }
    // Jika startDay = hari ini, startsAt = now; jika hari depan, startsAt = 00:00 hari itu
    if (T.dayKey(startDayParsed) === T.dayKey(now)) {
      startsAt = now;
    } else {
      startsAt = T.startOfDay(startDayParsed);
    }
  } else {
    // Tanpa startDay: mulai sekarang (bukan 00:00 hari ini).
    startsAt = now;
  }

  let endsAt: Date | null = null;

  switch (preset) {
    case 'TODAY': {
      endsAt = T.endOfDay(startsAt);
      break;
    }
    case 'DAYS_2': {
      const end = T.addDays(T.startOfDay(startsAt), 1);
      endsAt = T.endOfDay(end);
      break;
    }
    case 'DAYS_7': {
      const end = T.addDays(T.startOfDay(startsAt), 6);
      endsAt = T.endOfDay(end);
      break;
    }
    case 'CUSTOM': {
      if (!opts?.endDay) {
        return { error: 'Tanggal akhir tidak boleh kosong untuk preset CUSTOM.' };
      }
      const endDayParsed = T.parseDay(opts.endDay);
      if (!endDayParsed) {
        return { error: 'Tanggal akhir tidak valid.' };
      }
      const startDayKey = T.dayKey(startsAt);
      const endDayKey = T.dayKey(endDayParsed);
      if (endDayKey < startDayKey) {
        return { error: 'Tanggal akhir tidak boleh sebelum tanggal mulai.' };
      }
      endsAt = T.endOfDay(endDayParsed);
      break;
    }
    case 'OPEN':
      endsAt = null;
      break;
  }

  return { startsAt, endsAt };
}

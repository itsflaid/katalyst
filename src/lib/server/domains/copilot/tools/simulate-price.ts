import { and, eq } from 'drizzle-orm';
import { SENSITIVITY_LEVELS, assessScenario, dropFromElasticity, sensitivityBand, simulate, type ScenarioCode, type SimFlag } from '../../../../simulation';
import { ZERO_FACTS, type Facts } from '../../../../analytics/facts';
import { fmtDelta, fmtInt, fmtPercent, fmtPoints, fmtRupiah } from '../../../../shared/format';
import { resolveNamedPeriod, type NamedPeriodKey } from '../../../../shared/period';
import { product } from '../../../db/schema';
import { queryFactsByProduct } from '../../facts/queries';
import type { ToolContext } from '../context';
import { failure, success, type ToolResult } from '../envelope';
import { resolveProduct } from '../product-resolver';
import { validateArgs } from '../validate';

const TOOL = 'simulate_price';
const periods = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_30d', 'last_7d', 'last_90d', 'custom'] as const;
const DEFAULT_VOLUMES = [-20, -10, 0, 10, 20];

export function simFlagText(flag: SimFlag): string {
  switch (flag) {
    case 'NO_HISTORY':
      return 'Belum ada penjualan pada periode ini; memakai harga dan modal saat ini.';
    case 'BELOW_COST':
      return 'Harga simulasi di bawah modal; tiap unit terjual merugi.';
    case 'LOW_MARGIN':
      return 'Margin simulasi di bawah 15%; rawan terhapus oleh kenaikan modal.';
    case 'DISCOUNT_ON_CHANGED_PRICE':
      return 'Diskon dihitung dari harga baru, bukan harga awal.';
    case 'PROMO_SCALED_WITH_VOLUME':
      return 'Diskon mengikuti volume; total diskon ikut membesar.';
    case 'DRIFT_PRICE':
      return 'Harga jual saat ini berbeda dari rata-rata periode; simulasi memakai harga saat ini.';
    case 'DRIFT_COST':
      return 'Modal saat ini berbeda dari rata-rata periode; simulasi memakai modal saat ini.';
    case 'OUT_OF_RANGE_PRICE':
      return 'Harga skenario berubah lebih dari 30% dari harga sekarang; di luar jangkauan data, hasil spekulatif.';
    case 'VOLUME_CAPPED':
      return 'Kenaikan volume dibatasi 3× baseline (batas serap pasar).';
    case 'QUOTA_DEMAND_IGNORED':
      return 'Diskon berkuota: respons volume dari diskon tidak dihitung.';
  }
}

export interface VolumeScenario {
  volumePct: number;
  volumePctText: string;
  qty: number;
  qtyText: string;
  profit: number;
  profitText: string;
  profitVsNow: number | null;
  profitVsNowText: string;
  margin: number;
  marginText: string;
}

export interface DemandInfo {
  sensitivity: string;
  label: string;
  e: number;
  eText: string;
  dropPer10Pct: number;
  dropPer10PctText: string;
  factor: number;
  factorText: string;
  capped: boolean;
}

export interface SensitivityBandRow {
  sensitivity: string;
  label: string;
  qty: number;
  qtyText: string;
  profit: number;
  profitText: string;
  profitVsNow: number | null;
  profitVsNowText: string;
}

export interface AssessmentInfo {
  tone: string;
  code: ScenarioCode;
  text: string;
}

export interface SimulatePriceData {
  product: { id: string; name: string };
  window: { key: NamedPeriodKey; label: string };
  current: { profit: number; profitText: string; margin: number; marginText: string; qty: number; qtyText: string };
  simulated: { profit: number; profitText: string; margin: number; marginText: string; qty: number; qtyText: string };
  scenario: { priceText: string; priceChangeText: string | null; discountPctText: string | null };
  volumeScenarios: VolumeScenario[];
  breakEven: { volumePct: number | null; volumePctText: string | null; text: string | null };
  impact: { profit: number | null; profitText: string; marginPoints: number; marginPointsText: string };
  breakEvenQty: number | null;
  breakEvenQtyText: string | null;
  maxDiscountPct: number | null;
  maxDiscountPctText: string | null;
  profitAtMaxDiscount: number | null;
  profitAtMaxDiscountText: string | null;
  demand: DemandInfo | null;
  peak: { price: number; priceText: string; profit: number; profitText: string } | null;
  maxVolumeDrop: number | null;
  maxVolumeDropText: string | null;
  band: SensitivityBandRow[];
  assessment: AssessmentInfo;
  flags: { code: SimFlag; text: string }[];
  simulatorLink: string;
}

type SensitivityArg = 'low' | 'medium' | 'high';

function levelOf(id: SensitivityArg) {
  return SENSITIVITY_LEVELS.find((l) => l.id === id) ?? SENSITIVITY_LEVELS[1];
}

function assessmentText(code: ScenarioCode): string {
  switch (code) {
    case 'NO_VOLUME':
      return 'Belum ada volume: skenario ini tidak menjual apa pun.';
    case 'DEMAND_COLLAPSE':
      return 'Pada harga ini pembeli diperkirakan hilang.';
    case 'UNIT_LOSS':
      return 'Tiap unit merugi: harga efektif di bawah modal.';
    case 'LOSS':
      return 'Skenario merugi dibanding kondisi sekarang.';
    case 'OUT_OF_RANGE':
      return 'Harga di luar ±30% dari harga sekarang; hasil spekulatif.';
    case 'PROFIT_SENSITIVE':
      return 'Untung hanya bila pembeli cukup setia.';
    case 'PROFITABLE':
      return 'Skenario menguntungkan dengan margin terjaga.';
    case 'NEUTRAL':
      return 'Dampak kecil dibanding kondisi sekarang.';
  }
}

export function buildSimulatePriceData(input: {
  product: { id: string; name: string; sellingPrice: number; costPrice: number };
  baseline: Facts;
  period: NamedPeriodKey;
  windowLabel: string;
  targetPrice: number;
  priceDelta?: number;
  discountPct?: number;
  volumePcts: number[];
  sensitivity?: SensitivityArg;
}): SimulatePriceData {
  const discount = input.discountPct === undefined ? undefined : { kind: 'percent' as const, pct: input.discountPct };
  const level = input.sensitivity === undefined ? null : levelOf(input.sensitivity);
  const demandLever = level === null ? undefined : { kind: 'elasticity' as const, e: level.e };
  const runs = input.volumePcts.map((pct) =>
    simulate({
      baseline: input.baseline,
      product: input.product,
      levers: { price: input.targetPrice, ...(discount ? { discount } : {}), volume: { kind: 'pct' as const, pct }, ...(demandLever ? { demand: demandLever } : {}) }
    })
  );
  const zeroAt = input.volumePcts.indexOf(0);
  const chosenIndex = zeroAt >= 0 ? zeroAt : 0;
  const base = runs[chosenIndex];
  const chosen = runs[chosenIndex];
  const volumeScenarios: VolumeScenario[] = runs.map((result, i) => ({
    volumePct: input.volumePcts[i],
    volumePctText: fmtDelta(input.volumePcts[i] / 100),
    qty: result.qty.simulated,
    qtyText: fmtInt(result.qty.simulated),
    profit: result.simulated.profit,
    profitText: fmtRupiah(result.simulated.profit),
    profitVsNow: result.impact.vsStatusQuo.profit,
    profitVsNowText: fmtDelta(result.impact.vsStatusQuo.profit),
    margin: result.simulated.margin,
    marginText: fmtPercent(result.simulated.margin)
  }));
  const seen = new Set<SimFlag>();
  const flags = runs
    .flatMap((result) => result.flags)
    .filter((flag) => (seen.has(flag) ? false : (seen.add(flag), true)))
    .map((code) => ({ code, text: simFlagText(code) }));
  const breakEvenVolume =
    base.breakEvenQty === null || input.baseline.qty === 0 ? null : base.breakEvenQty / input.baseline.qty - 1;
  // Laba bila diskon maksimal ikut dipasang: titik impas, bukan angka simulated.profit.
  let profitAtMaxDiscount: number | null = null;
  if (base.maxDiscountPct !== null) {
    const atMax = simulate({
      baseline: input.baseline,
      product: input.product,
      levers: { price: input.targetPrice, discount: { kind: 'percent' as const, pct: base.maxDiscountPct }, volume: { kind: 'pct' as const, pct: input.volumePcts[chosenIndex] }, ...(demandLever ? { demand: demandLever } : {}) }
    });
    profitAtMaxDiscount = atMax.simulated.profit;
  }
  const bandInput = {
    baseline: input.baseline,
    product: input.product,
    price: input.targetPrice,
    ...(discount ? { discount } : {})
  };
  const band: SensitivityBandRow[] =
    level === null
      ? []
      : sensitivityBand({
          baseline: bandInput.baseline,
          product: bandInput.product,
          levers: { price: bandInput.price, ...(bandInput.discount ? { discount: bandInput.discount } : {}), volume: { kind: 'pct' as const, pct: 0 } }
        }).map((b) => ({
          sensitivity: b.id,
          label: b.label,
          qty: b.result.qty.simulated,
          qtyText: fmtInt(b.result.qty.simulated),
          profit: b.result.simulated.profit,
          profitText: fmtRupiah(b.result.simulated.profit),
          profitVsNow: b.result.impact.vsStatusQuo.profit,
          profitVsNowText: fmtDelta(b.result.impact.vsStatusQuo.profit)
        }));
  const assessed = assessScenario(chosen, band.map((b) => b.profitVsNow));
  const drop = level === null ? 0 : dropFromElasticity(level.e);
  return {
    product: { id: input.product.id, name: input.product.name },
    window: { key: input.period, label: input.windowLabel },
    current: { profit: base.statusQuo.profit, profitText: fmtRupiah(base.statusQuo.profit), margin: base.statusQuo.margin, marginText: fmtPercent(base.statusQuo.margin), qty: base.statusQuo.qty, qtyText: fmtInt(base.statusQuo.qty) },
    simulated: { profit: chosen.simulated.profit, profitText: fmtRupiah(chosen.simulated.profit), margin: chosen.simulated.margin, marginText: fmtPercent(chosen.simulated.margin), qty: chosen.simulated.qty, qtyText: fmtInt(chosen.simulated.qty) },
    scenario: {
      priceText: fmtRupiah(input.targetPrice),
      priceChangeText:
        input.priceDelta === undefined
          ? null
          : `${input.priceDelta < 0 ? '-' : '+'}${fmtRupiah(Math.abs(input.priceDelta))}`,
      discountPctText: input.discountPct === undefined ? null : fmtPercent(input.discountPct / 100)
    },
    volumeScenarios,
    breakEven: {
      volumePct: breakEvenVolume,
      volumePctText: breakEvenVolume === null ? null : fmtPercent(breakEvenVolume),
      text: breakEvenVolume === null ? null : fmtPercent(breakEvenVolume)
    },
    impact: { profit: chosen.impact.vsStatusQuo.profit, profitText: fmtDelta(chosen.impact.vsStatusQuo.profit), marginPoints: chosen.impact.vsStatusQuo.marginPoints, marginPointsText: fmtPoints(chosen.impact.vsStatusQuo.marginPoints) },
    breakEvenQty: base.breakEvenQty,
    breakEvenQtyText: base.breakEvenQty === null ? null : fmtInt(base.breakEvenQty),
    maxDiscountPct: base.maxDiscountPct,
    maxDiscountPctText: base.maxDiscountPct === null ? null : fmtPercent(base.maxDiscountPct / 100),
    profitAtMaxDiscount,
    profitAtMaxDiscountText: profitAtMaxDiscount === null ? null : fmtRupiah(profitAtMaxDiscount),
    demand:
      level === null
        ? null
        : {
            sensitivity: input.sensitivity as string,
            label: level.label,
            e: level.e,
            eText: String(level.e),
            dropPer10Pct: drop,
            dropPer10PctText: fmtPercent(drop),
            factor: chosen.demand.factor,
            factorText: `×${String(Math.round(chosen.demand.factor * 1000) / 1000).replace('.', ',')}`,
            capped: chosen.demand.capped
          },
    peak:
      chosen.peak === null
        ? null
        : { price: chosen.peak.price, priceText: fmtRupiah(chosen.peak.price), profit: chosen.peak.profit, profitText: fmtRupiah(chosen.peak.profit) },
    maxVolumeDrop: chosen.maxVolumeDrop,
    maxVolumeDropText: chosen.maxVolumeDrop === null ? null : fmtPercent(chosen.maxVolumeDrop),
    band,
    assessment: { tone: assessed.tone, code: assessed.code, text: assessmentText(assessed.code) },
    flags,
    simulatorLink: `/simulator?productId=${encodeURIComponent(input.product.id)}`
  };
}

export async function simulatePrice(ctx: ToolContext, input: unknown): Promise<ToolResult<SimulatePriceData>> {
  const checked = validateArgs(input, {
    product: { type: 'string', required: true }, period: { type: 'string', enum: periods }, from: { type: 'string' }, to: { type: 'string' },
    priceDelta: { type: 'integer' }, price: { type: 'integer', min: 0 }, discountPct: { type: 'integer', min: 0, max: 100 }, volumePct: { type: 'integer', min: -100, max: 1000 },
    sensitivity: { type: 'string', enum: ['low', 'medium', 'high'] }
  });
  if (!checked.ok) return failure(TOOL, 'INVALID_ARGS', checked.message);
  const period = (checked.value.period ?? 'last_30d') as NamedPeriodKey;
  const from = checked.value.from as string | undefined;
  const to = checked.value.to as string | undefined;
  if (period === 'custom' && (!from || !to)) return failure(TOOL, 'INVALID_ARGS', 'Periode custom memerlukan from dan to.');
  const window = resolveNamedPeriod(period, ctx.tz, ctx.now, from && to ? { from, to } : undefined);
  if (!window.from || !window.to) return failure(TOOL, 'INVALID_ARGS', 'Periode tidak valid.');
  const products = await ctx.db.select({ id: product.id, name: product.name, sellingPrice: product.sellingPrice, costPrice: product.costPrice }).from(product).where(and(eq(product.businessId, ctx.businessId), eq(product.isActive, true)));
  const resolved = resolveProduct(checked.value.product as string, products);
  if (resolved.kind === 'not_found') {
    const names = resolved.candidates.map((c) => c.name).join(', ');
    return failure(TOOL, 'PRODUCT_NOT_FOUND', `Produk '${resolved.query}' tidak ditemukan.${names ? ` Yang mirip: ${names}.` : ''}`, resolved.candidates);
  }
  if (resolved.kind === 'ambiguous') return failure(TOOL, 'AMBIGUOUS_PRODUCT', `Ada ${resolved.candidates.length} produk yang cocok dengan '${resolved.query}'.`, resolved.candidates);
  const selected = products.find((item) => item.id === resolved.product.id)!;
  const facts = await queryFactsByProduct(ctx.db, ctx.businessId, { from: window.from, to: window.to }, { productIds: [selected.id] });
  const baseline = facts.get(selected.id) ?? ZERO_FACTS;
  const price = checked.value.price as number | undefined;
  const priceDelta = checked.value.priceDelta as number | undefined;
  if (price !== undefined && priceDelta !== undefined) return failure(TOOL, 'INVALID_ARGS', 'Pakai price atau priceDelta, bukan keduanya.');
  const targetPrice = price ?? (priceDelta === undefined ? selected.sellingPrice : selected.sellingPrice + priceDelta);
  if (targetPrice < 0) return failure(TOOL, 'INVALID_ARGS', 'Harga hasil simulasi tidak boleh negatif.');
  const volumePct = checked.value.volumePct as number | undefined;
  const volumePcts = volumePct === undefined ? DEFAULT_VOLUMES : [volumePct];
  const sensitivity = (checked.value.sensitivity as SensitivityArg | undefined) ?? 'medium';
  try {
    const data = buildSimulatePriceData({
      product: { ...selected, name: resolved.product.name },
      baseline,
      period,
      windowLabel: window.label,
      targetPrice,
      ...(priceDelta === undefined ? {} : { priceDelta }),
      ...(checked.value.discountPct === undefined ? {} : { discountPct: checked.value.discountPct as number }),
      volumePcts,
      sensitivity
    });
    const notes = ['Skenario volume adalah asumsi, bukan prediksi.'];
    const lvl = levelOf(sensitivity);
    notes.push(`Angka respons pembeli hanya asumsi/perkiraan, bukan kepastian (sensitivitas ${lvl.label}).`);
    return success(TOOL, data, notes);
  } catch (error) {
    return failure(TOOL, 'INVALID_ARGS', error instanceof Error ? error.message : 'Skenario tidak valid.');
  }
}

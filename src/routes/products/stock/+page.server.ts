import { requireOwner } from '$lib/server/domains/auth/guards';
import { STOCK_REASONS, getStockLedger, type StockReason } from '$lib/server/domains/products';
import { DEFAULT_TZ, makeTime } from '$lib/shared/time';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  const { businessId } = requireOwner(locals);
  // Zona bisnis untuk parsing & label tanggal (bukan zona perangkat).
  const tz = locals.business?.timezone ?? DEFAULT_TZ;
  const T = makeTime(tz);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);

  const reasonParam = url.searchParams.get('reason') ?? '';
  const reason = (STOCK_REASONS as readonly string[]).includes(reasonParam) ? (reasonParam as StockReason) : null;
  const productParam = url.searchParams.get('product') ?? '';
  const fromParsed = T.parseDay(url.searchParams.get('from') ?? '');
  const toParsed = T.parseDay(url.searchParams.get('to') ?? '');

  const { products, movements, summary, hasMore } = await getStockLedger(businessId, {
    reason,
    productId: productParam,
    from: fromParsed,
    to: toParsed ? T.endOfDay(toParsed) : null,
    page
  });

  const qs = (extra: Record<string, string | number>) => {
    const params = new URLSearchParams();
    if (reason) params.set('reason', reason);
    if (productParam) params.set('product', productParam);
    if (fromParsed) params.set('from', T.dayKey(fromParsed));
    if (toParsed) params.set('to', T.dayKey(toParsed));
    for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
    const s = params.toString();
    return `/products/stock${s ? `?${s}` : ''}`;
  };

  return {
    movements,
    summary,
    products,
    page,
    hasMore,
    moreHref: qs({ page: page + 1 }),
    reason,
    productFilter: productParam,
    fromISO: fromParsed ? T.dayKey(fromParsed) : '',
    toISO: toParsed ? T.dayKey(toParsed) : '',
    timezone: tz
  };
};

import { requireOwner } from '$lib/server/domains/auth/guards';
import { listActivity, listActivityUsers } from '$lib/server/domains/activity/queries';
import { ACTION_FILTERS, type ActivityAction } from '$lib/shared/activity';
import { DEFAULT_TZ, isBizTz, makeTime } from '$lib/shared/time';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 30;

export const load: PageServerLoad = async ({ locals, url }) => {
  const { businessId } = requireOwner(locals);

  const peranRaw = url.searchParams.get('peran') ?? 'all';
  const peran = peranRaw === 'owner' ? 'owner' : peranRaw === 'staff' ? 'staff' : 'all';

  const userRows = await listActivityUsers(businessId);
  const orangOptions = userRows
    .filter((u) => (peran === 'staff' ? u.role === 'STAFF' : peran === 'owner' ? u.role === 'OWNER' : true))
    .map((u) => ({ id: u.id, name: u.name ?? u.username ?? '-' }));
  const orangParam = url.searchParams.get('orang') ?? '';
  const orang = userRows.some((u) => u.id === orangParam) ? orangParam : null;

  const aksiRaw = url.searchParams.get('aksi') ?? '';
  const aksiEntry = ACTION_FILTERS.find((a) => a.key === aksiRaw) ?? null;
  const aksi = aksiEntry ? aksiEntry.key : null;
  const actions: readonly ActivityAction[] | null = aksiEntry ? aksiEntry.actions : null;

  // Rentang tanggal zona bisnis; ujung rusak diabaikan, dari > sampai ditukar.
  const tzRaw = locals.business?.timezone;
  const timezone = isBizTz(tzRaw) ? tzRaw : DEFAULT_TZ;
  const T = makeTime(timezone);
  let fromStart = T.parseDay((url.searchParams.get('from') ?? '').trim());
  let toStart = T.parseDay((url.searchParams.get('to') ?? '').trim());
  if (fromStart && toStart && fromStart.getTime() > toStart.getTime()) {
    const t = fromStart;
    fromStart = toStart;
    toStart = t;
  }
  const rangeFrom = fromStart ? T.dayKey(fromStart) : null;
  const rangeTo = toStart ? T.dayKey(toStart) : null;

  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const { rows, hasMore } = await listActivity(businessId, {
    role: peran,
    actorId: orang,
    actions,
    from: fromStart,
    to: toStart ? T.addDays(toStart, 1) : null,
    page,
    pageSize: PAGE_SIZE
  });

  return {
    rows: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    page,
    hasMore,
    peran,
    orang,
    aksi,
    rangeFrom,
    rangeTo,
    timezone,
    orangOptions
  };
};

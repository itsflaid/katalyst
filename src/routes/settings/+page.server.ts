import { requireOwner } from '$lib/server/domains/auth/guards';
import { getBusinessById } from '$lib/server/domains/business';
import { listPendingInvites, listStaff } from '$lib/server/domains/staff';
import { DEFAULT_TZ } from '$lib/shared/time';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { businessId, userId } = requireOwner(locals);
  const b = await getBusinessById(businessId);
  const staffList = await listStaff(businessId);
  // Undangan yang masih pending (belum diterima/dicabut, termasuk yang kedaluwarsa; frontend yang memberi badge + tombol kirim ulang).
  const pendingInvites = await listPendingInvites(businessId);

  return {
    businessName: b?.name ?? '',
    timezone: b?.timezone ?? DEFAULT_TZ,
    staffList,
    pendingInvites: pendingInvites.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString(), createdAt: i.createdAt.toISOString() })),
    currentUserId: userId
  };
};

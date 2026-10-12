import { db } from '$lib/server/db';
import { activityLog, user } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { activityRow, type ActivityInput } from './row';

export type { ActivityInput };
export { activityRow };

// Insert tunggal best-effort: kegagalan catat tidak boleh menggagalkan aksi utama.
export async function recordActivity(input: ActivityInput): Promise<void> {
  try {
    await db.insert(activityLog).values(activityRow(input));
  } catch (e) {
    console.error('recordActivity gagal', e);
  }
}

// Nama diambil name ?? username agar baris log tetap terbaca bila salah satunya kosong.
export function actorOf(user: NonNullable<App.Locals['user']>): ActivityInput['actor'] {
  const u = user as { id?: unknown; name?: unknown; username?: unknown; role?: unknown };
  const name = typeof u.name === 'string' && u.name ? u.name : typeof u.username === 'string' && u.username ? u.username : '-';
  return {
    id: typeof u.id === 'string' ? u.id : null,
    name,
    role: u.role === 'STAFF' ? 'STAFF' : 'OWNER'
  };
}

// IP seluler sering berganti sehingga bukan sinyal perangkat; hanya UA yang dibandingkan, IP cuma info tambahan.
export async function recordLogin(s: {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    const [u] = await db
      .select({ id: user.id, name: user.name, username: user.username, role: user.role, businessId: user.businessId })
      .from(user)
      .where(eq(user.id, s.userId));
    if (!u || !u.businessId) return;
    const ua = s.userAgent ?? null;
    const prev = await db
      .select({ id: activityLog.id, userAgent: activityLog.userAgent })
      .from(activityLog)
      .where(
        and(
          eq(activityLog.businessId, u.businessId),
          eq(activityLog.actorId, u.id),
          eq(activityLog.action, 'LOGIN')
        )
      );
    // Login pertama user sengaja tidak ditandai perangkat baru.
    const newDevice = prev.length > 0 && !!ua && !prev.some((p) => p.userAgent === ua);
    await db.insert(activityLog).values(
      activityRow({
        businessId: u.businessId,
        actor: {
          id: u.id,
          name: u.name ?? u.username ?? '-',
          role: u.role === 'STAFF' ? 'STAFF' : 'OWNER'
        },
        action: 'LOGIN',
        ip: s.ip ?? null,
        userAgent: ua,
        meta: { newDevice }
      })
    );
  } catch (e) {
    console.error('recordLogin gagal', e);
  }
}

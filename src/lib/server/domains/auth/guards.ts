import { error } from '@sveltejs/kit';

export type Role = 'OWNER' | 'STAFF';

export interface Tenant {
  user: NonNullable<App.Locals['user']>;
  userId: string;
  businessId: string;
  role: Role;
}

function isRole(value: unknown): value is Role {
  return value === 'OWNER' || value === 'STAFF';
}

// Penjaga throw-based lapis kedua bila guard hooks terlewati; Tenant yang
// kembali sudah menyempit tipenya sehingga route tak perlu `!` atau `as`.
export function requireTenant(locals: App.Locals): Tenant {
  const user = locals.user;
  if (!user) throw error(401, 'Belum login.');
  if (!isRole(user.role)) throw error(403, 'Peran akun tidak dikenali.');
  if (!user.businessId) throw error(403, 'Akun belum terhubung ke bisnis.');
  return { user, userId: user.id, businessId: user.businessId, role: user.role };
}

export function requireOwner(locals: App.Locals): Tenant {
  const tenant = requireTenant(locals);
  if (tenant.role !== 'OWNER') throw error(403, 'Hanya owner yang boleh melakukan ini.');
  return tenant;
}

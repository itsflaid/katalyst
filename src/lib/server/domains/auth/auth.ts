import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, username } from 'better-auth/plugins';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { recordLogin } from '$lib/server/domains/activity/log';
import { env } from '$env/dynamic/private';

// better-auth handle hashing password (scrypt), tidak perlu bcryptjs manual.
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL ?? 'http://localhost:5173',
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema
  }),
  plugins: [
    // Plugin admin dipakai server-side: setUserPassword, revokeUserSessions.
    // defaultRole harus 'OWNER' karena enum role hanya OWNER dan STAFF.
    admin({ adminRoles: ['OWNER'], defaultRole: 'OWNER', roles: { OWNER: adminAc, STAFF: userAc } }),
    // Login staff pakai username (staff tidak wajib punya email).
    // Format username selaras dengan isValidUsername di invites.ts.
    username({
      displayUsername: false,
      minUsernameLength: 3,
      maxUsernameLength: 20,
      // Normalisasi huruf kecil sebelum validasi.
      usernameValidator: (u) => /^[a-z0-9._-]+$/.test(u),
      validationOrder: { username: 'pre-normalization' }
    })
  ],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6
  },
  // Default better-auth hanya aktif bila NODE_ENV=production, yang tidak di-set di Workers.
  rateLimit: {
    enabled: env.AUTH_RATE_LIMIT !== 'off',
    customRules: {
      '/sign-in/username': { window: 60, max: 5 },
      '/sign-in/email': { window: 60, max: 5 }
    }
  },
  // Hook sesi dibuat berarti login baru; perpanjangan sesi tidak memicu ini.
  databaseHooks: {
    session: {
      create: {
        after: async (s) => {
          await recordLogin({ userId: s.userId, ip: s.ipAddress, userAgent: s.userAgent });
        }
      }
    }
  },
  // x-forwarded-for berantai dianggap tak terpercaya; cf-connecting-ip selalu satu nilai dari Cloudflare.
  advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 hari
    updateAge: 60 * 60 * 24
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'OWNER',
        input: false // role tidak boleh diisi langsung dari client saat signup
      },
      businessId: {
        type: 'string',
        required: false,
        input: false
      }
    }
  }
});

export type Session = typeof auth.$Infer.Session;

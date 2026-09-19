import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';
import { db } from './db';
import * as schema from './db/schema';
import { env } from '$env/dynamic/private';

// Setara authOptions di app/api/auth/[...nextauth]/route.ts versi Next.
// Bedanya: better-auth handle hashing password sendiri (scrypt), jadi
// gak perlu bcryptjs manual kayak CredentialsProvider punya NextAuth.
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL ?? 'http://localhost:5173',
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema
  }),
  plugins: [
    // Admin plugin dipakai server-side saja (auth.api.setUserPassword,
    // revokeUserSessions buat reset password staff oleh owner). Nama role
    // kita (OWNER/STAFF) wajib didaftarkan di `roles` — tanpa ini build
    // melempar "Invalid admin roles". OWNER dapat izin admin penuh
    // (set-password, revoke, ...), STAFF tidak dapat izin apa pun.
    // Kolom tambahan plugin (banned, dsb) tidak dipakai jadi tidak perlu migrasi.
    admin({ adminRoles: ['OWNER'], roles: { OWNER: adminAc, STAFF: userAc } })
  ],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 hari, sama kayak default JWT session NextAuth sebelumnya
    updateAge: 60 * 60 * 24
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'OWNER',
        input: false // role gak boleh diisi langsung dari client saat signup
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

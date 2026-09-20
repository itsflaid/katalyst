import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import * as schema from './schema';
import { business, user } from './schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { placeholderEmail, normalizeUsername, isValidUsername } from '../domains/invites';

// -----------------------------------------------------------------------
// Bootstrap script buat deployment beneran — BUKAN demo. Bikin 1 business
// + 1 Owner dari environment variable, tanpa data dummy apa pun. Beda dari
// seed-demo.ts yang tujuannya portfolio/demo (data lengkap 90 hari + 4 staff
// dummy). Jalanin ini SEKALI aja pas pertama kali app di-deploy ke klien
// beneran. Kalau mau ganti username/password/nama owner ke depannya, cukup
// ubah .env — file ini sendiri gak perlu disentuh lagi.
//
// Kenapa standalone (bukan reuse src/lib/server/db/index.ts + auth.ts):
// keduanya pakai `$env/dynamic/private`, virtual module yang cuma
// ke-resolve di dalam Vite runtime — script ini dijalankan lewat `tsx`
// langsung (di luar Vite), jadi bikin db client & instance betterAuth
// sendiri dari process.env, pola yang sama seperti seed-demo.ts.
// -----------------------------------------------------------------------

const required = ['DATABASE_URL', 'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'BUSINESS_NAME'] as const;
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`${key} belum di-set. Cek .env — lihat .env.example untuk daftar variabel seed-real.`);
  }
}

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client, { schema });

const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:5173',
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: true, minPasswordLength: 6 },
  user: {
    additionalFields: {
      role: { type: 'string', required: false, defaultValue: 'OWNER', input: false },
      businessId: { type: 'string', required: false, input: false }
    }
  }
});

async function main() {
  const rawUsername = process.env.ADMIN_USERNAME!;
  const username = normalizeUsername(rawUsername);
  if (!isValidUsername(username)) {
    throw new Error(
      `ADMIN_USERNAME "${rawUsername}" tidak valid (3-20 karakter, huruf/angka/titik/underscore/strip saja).`
    );
  }

  const password = process.env.ADMIN_PASSWORD!;
  const adminName = process.env.ADMIN_NAME ?? 'Owner';
  const businessName = process.env.BUSINESS_NAME!;

  console.log(`Bootstrapping business "${businessName}" dengan owner "${username}"...`);

  const businessId = randomUUID();
  await db.insert(business).values({ id: businessId, name: businessName });

  const ownerSignUp = await auth.api.signUpEmail({
    body: { email: placeholderEmail(username), password, name: adminName }
  });

  await db
    .update(user)
    .set({ role: 'OWNER', businessId, username })
    .where(eq(user.id, ownerSignUp.user.id));

  console.log('Bootstrap selesai.');
  console.log(`Login sebagai Owner: ${username} / (password sesuai ADMIN_PASSWORD di .env)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => client.end());

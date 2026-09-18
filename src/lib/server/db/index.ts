import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

if (!env.DATABASE_URL) {
  throw new Error('DATABASE_URL belum di-set. Cek .env / .env.example.');
}

// neon-http: query lewat HTTPS — satu-satunya cara dari Cloudflare Workers
// (tidak ada socket TCP, jadi driver `postgres` biasa tidak bisa dipakai).
// Bisa dipakai lokal juga selama DATABASE_URL-nya mengarah ke Neon.
const client = neon(env.DATABASE_URL);

export const db = drizzle(client, { schema });

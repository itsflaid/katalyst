import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

if (!env.DATABASE_URL) {
  throw new Error('DATABASE_URL belum di-set. Cek .env / .env.example.');
}

const client = postgres(env.DATABASE_URL);

export const db = drizzle(client, { schema });

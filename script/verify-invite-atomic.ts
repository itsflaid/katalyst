// Revoke lama + terbit baru harus atomik: satu pending tersisa,
// kegagalan insert membatalkan revoke. Satu transaksi di-rollback.
import 'dotenv/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import * as schema from '../src/lib/server/db/schema';
import { business, staffInvitation } from '../src/lib/server/db/schema';

type Tx = PostgresJsDatabase<typeof schema>;

let passCount = 0;
let failCount = 0;
function ok(label: string, cond: boolean, detail = '') {
	if (cond) {
		console.log(`  \x1b[32mPASS\x1b[0m  ${label}`);
		passCount++;
	} else {
		console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? `: ${detail}` : ''}`);
		failCount++;
	}
}

async function pendingCount(tx: Tx, biz: string, username: string): Promise<number> {
	const rows = await tx
		.select({ id: staffInvitation.id })
		.from(staffInvitation)
		.where(
			and(
				eq(staffInvitation.businessId, biz),
				eq(staffInvitation.username, username),
				isNull(staffInvitation.acceptedAt),
				isNull(staffInvitation.revokedAt)
			)
		);
	return rows.length;
}

async function main() {
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum di-set.');
	const client = postgres(process.env.DATABASE_URL);
	const db = drizzle(client, { schema });
	const ROLLBACK = new Error('__rollback_fixture__');

	try {
		await db.transaction(async (tx) => {
			const biz = randomUUID();
			await tx.insert(business).values({ id: biz, name: 'Fixture Atomik' });
			const username = `kasir${randomUUID().slice(0, 8)}`;
			const expires = new Date(Date.now() + 48 * 60 * 60 * 1000);
			const h1 = randomUUID();
			const h2 = randomUUID();
			await tx.insert(staffInvitation).values([
				{ id: randomUUID(), businessId: biz, username, tokenHash: h1, expiresAt: expires },
				{ id: randomUUID(), businessId: biz, username, tokenHash: h2, expiresAt: expires }
			]);
			ok('fixture dua pending', (await pendingCount(tx, biz, username)) === 2);

			// Pola endpoint: revoke semua pending lalu insert baru dalam satu transaksi.
			const before = await tx
				.select({ id: staffInvitation.id })
				.from(staffInvitation)
				.where(
					and(
						eq(staffInvitation.businessId, biz),
						eq(staffInvitation.username, username),
						isNull(staffInvitation.acceptedAt),
						isNull(staffInvitation.revokedAt)
					)
				);
			const now = new Date();
			await tx.transaction(async (s) => {
				for (const p of before) {
					await s.update(staffInvitation).set({ revokedAt: now }).where(eq(staffInvitation.id, p.id));
				}
				await s.insert(staffInvitation).values({
					id: randomUUID(),
					businessId: biz,
					username,
					tokenHash: randomUUID(),
					expiresAt: expires
				});
			});
			ok('tepat satu pending tersisa', (await pendingCount(tx, biz, username)) === 1);

			// Kegagalan insert (tokenHash ganda) membatalkan revoke di savepoint yang sama.
			const dupe = randomUUID();
			await tx.insert(staffInvitation).values({ id: randomUUID(), businessId: biz, username, tokenHash: dupe, expiresAt: expires });
			const countBefore = await pendingCount(tx, biz, username);
			try {
				await tx.transaction(async (s) => {
					const actives = await s
						.select({ id: staffInvitation.id })
						.from(staffInvitation)
						.where(
							and(
								eq(staffInvitation.businessId, biz),
								eq(staffInvitation.username, username),
								isNull(staffInvitation.acceptedAt),
								isNull(staffInvitation.revokedAt)
							)
						);
					for (const p of actives) {
						await s.update(staffInvitation).set({ revokedAt: new Date() }).where(eq(staffInvitation.id, p.id));
					}
					await s.insert(staffInvitation).values({ id: randomUUID(), businessId: biz, username, tokenHash: dupe, expiresAt: expires });
				});
				ok('insert ganda seharusnya gagal', false);
			} catch {
				ok('insert ganda gagal atomik', (await pendingCount(tx, biz, username)) === countBefore);
			}

			throw ROLLBACK;
		});
	} catch (e) {
		if (e !== ROLLBACK) throw e;
	}
	await client.end();
	console.log(`\n${passCount} passed, ${failCount} failed\n`);
	if (failCount > 0) process.exit(1);
}

void main();

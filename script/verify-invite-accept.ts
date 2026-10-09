// Alur terima undangan: username ternormalisasi, user STAFF sejak insert
// pertama, duplikat ditolak tanpa akun baru, link mati ditolak.
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import * as schema from '../src/lib/server/db/schema';
import { business, staffInvitation, user } from '../src/lib/server/db/schema';
import {
	hashInviteToken,
	isValidUsername,
	normalizeUsername,
	placeholderEmail
} from '../src/lib/server/domains/invites/queries';

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

async function main() {
	ok('normalisasi huruf kecil', normalizeUsername('  Kasir.BarU  ') === 'kasir.baru');
	ok('validasi aturan sama', isValidUsername('kasir.baru') && !isValidUsername('Kasir!'));
	const mail = placeholderEmail('Kasir.BarU');
	ok('email sintetis valid', mail === 'kasir.baru@staff.internal' && /^\S+@\S+\.\S+$/.test(mail), mail);

	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum di-set.');
	const client = postgres(process.env.DATABASE_URL);
	const db = drizzle(client, { schema });
	const ROLLBACK = new Error('__rollback_fixture__');

	try {
		await db.transaction(async (tx) => {
			const biz = randomUUID();
			await tx.insert(business).values({ id: biz, name: 'Fixture Invite' });
			const username = `kasir${randomUUID().slice(0, 8)}`;

			// Satu insert langsung STAFF + bisnis: baca tepat setelahnya tanpa langkah update.
			const uid = randomUUID();
			await tx.insert(user).values({
				id: uid,
				name: username,
				email: placeholderEmail(username),
				username,
				role: 'STAFF',
				businessId: biz
			});
			const [created] = await tx.select({ role: user.role, businessId: user.businessId }).from(user).where(eq(user.id, uid));
			ok('staff sejak dibuat', created?.role === 'STAFF' && created?.businessId === biz, JSON.stringify(created));

			// Username ganda: tidak ada user baru.
			try {
				await tx.transaction(async (s) => {
					await s.insert(user).values({ id: randomUUID(), email: placeholderEmail(username) + 'x', username, role: 'STAFF', businessId: biz });
				});
				ok('username ganda ditolak', false);
			} catch {
				const dupes = await tx.select({ id: user.id }).from(user).where(eq(user.username, username));
				ok('username ganda tanpa akun baru', dupes.length === 1);
			}

			// Status undangan seperti keputusan endpoint.
			const future = new Date(Date.now() + 3600_000);
			const past = new Date(Date.now() - 1000);
			const raws = { valid: randomUUID(), expired: randomUUID(), revoked: randomUUID(), used: randomUUID() };
			const hashes = {
				valid: await hashInviteToken(raws.valid),
				expired: await hashInviteToken(raws.expired),
				revoked: await hashInviteToken(raws.revoked),
				used: await hashInviteToken(raws.used)
			};
			await tx.insert(staffInvitation).values([
				{ id: randomUUID(), businessId: biz, username: 'a', tokenHash: hashes.valid, expiresAt: future },
				{ id: randomUUID(), businessId: biz, username: 'b', tokenHash: hashes.expired, expiresAt: past },
				{ id: randomUUID(), businessId: biz, username: 'c', tokenHash: hashes.revoked, expiresAt: future, revokedAt: new Date() },
				{ id: randomUUID(), businessId: biz, username: 'd', tokenHash: hashes.used, expiresAt: future, acceptedAt: new Date() }
			]);
			async function statusOf(raw: string): Promise<'valid' | 'expired' | 'invalid'> {
				const [inv] = await tx.select().from(staffInvitation).where(eq(staffInvitation.tokenHash, await hashInviteToken(raw)));
				if (!inv || inv.acceptedAt || inv.revokedAt) return 'invalid';
				if (inv.expiresAt.getTime() < Date.now()) return 'expired';
				return 'valid';
			}
			ok('undangan valid', (await statusOf(raws.valid)) === 'valid');
			ok('kedaluwarsa ditolak', (await statusOf(raws.expired)) === 'expired');
			ok('dicabut ditolak', (await statusOf(raws.revoked)) === 'invalid');
			ok('terpakai ditolak', (await statusOf(raws.used)) === 'invalid');

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

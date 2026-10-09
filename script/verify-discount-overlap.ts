// Exclusion constraint overlap diskon: tumpang tindih ditolak 23P01,
// menempel tepat lolos, nonaktif dan global tak terpengaruh.
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import * as schema from '../src/lib/server/db/schema';
import { business, discount, product } from '../src/lib/server/db/schema';

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

function codeOf(e: unknown): string {
	const err = e as { code?: string; cause?: { code?: string } };
	return err?.code ?? err?.cause?.code ?? '';
}

async function main() {
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum di-set.');
	const client = postgres(process.env.DATABASE_URL);
	const db = drizzle(client, { schema });
	const ROLLBACK = new Error('__rollback_fixture__');

	try {
		await db.transaction(async (tx) => {
			const biz = randomUUID();
			await tx.insert(business).values({ id: biz, name: 'Fixture Overlap' });
			const prod = randomUUID();
			await tx.insert(product).values({ id: prod, businessId: biz, name: 'P', costPrice: 6000, sellingPrice: 10000, stock: 100 });
			const t0 = new Date('2026-09-01T00:00:00.000Z');
			const t1 = new Date('2026-09-01T01:00:00.000Z');
			const t2 = new Date('2026-09-01T02:00:00.000Z');
			const half = new Date('2026-09-01T00:30:00.000Z');
			const half3 = new Date('2026-09-01T01:30:00.000Z');
			await tx.insert(discount).values({ id: randomUUID(), businessId: biz, name: 'A', scope: 'PRODUCT', percent: 10, productId: prod, startsAt: t0, endsAt: t1 });

			async function expectViolation(label: string, fn: (s: typeof tx) => Promise<unknown>) {
				try {
					await tx.transaction(async (s) => {
						await fn(s as typeof tx);
					});
					ok(label, false, 'seharusnya gagal tapi sukses');
				} catch (e) {
					ok(label, codeOf(e) === '23P01', `code=${codeOf(e)}`);
				}
			}

			await expectViolation('tumpang tindih ditolak', (s) =>
				s.insert(discount).values({ id: randomUUID(), businessId: biz, name: 'B', scope: 'PRODUCT', percent: 10, productId: prod, startsAt: half, endsAt: half3 })
			);

			try {
				await tx.insert(discount).values({ id: randomUUID(), businessId: biz, name: 'C', scope: 'PRODUCT', percent: 10, productId: prod, startsAt: t1, endsAt: t2 });
				ok('menempel tepat lolos', true);
			} catch (e) {
				ok('menempel tepat lolos', false, String(e).slice(0, 120));
			}

			try {
				await tx.insert(discount).values({ id: randomUUID(), businessId: biz, name: 'D', scope: 'PRODUCT', percent: 10, productId: prod, startsAt: half, endsAt: half3, isActive: false });
				ok('nonaktif tak terpengaruh', true);
			} catch (e) {
				ok('nonaktif tak terpengaruh', false, String(e).slice(0, 120));
			}

			try {
				await tx.insert(discount).values({ id: randomUUID(), businessId: biz, name: 'G', scope: 'GLOBAL', percent: 10, startsAt: half, endsAt: half3 });
				ok('global tak terpengaruh', true);
			} catch (e) {
				ok('global tak terpengaruh', false, String(e).slice(0, 120));
			}

			const fid = randomUUID();
			await tx.insert(discount).values({ id: fid, businessId: biz, name: 'F', scope: 'PRODUCT', percent: 10, productId: prod, startsAt: t1, endsAt: t2, isActive: false });
			await expectViolation('menyalakan yang tumpang tindih ditolak', (s) =>
				s.update(discount).set({ isActive: true }).where(eq(discount.id, fid))
			);

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

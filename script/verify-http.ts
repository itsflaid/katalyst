import { readJsonObject } from '../src/lib/server/http';

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

function fakeRequest(json: () => Promise<unknown>): { json(): Promise<unknown> } {
	return { json };
}

const valid = await readJsonObject(fakeRequest(async () => ({ name: 'Toko' })));
ok('objek valid', valid.ok && (valid.ok ? (valid.body.name as string) === 'Toko' : false));

const broken = await readJsonObject(
	fakeRequest(async () => {
		throw new SyntaxError('Unexpected end');
	})
);
ok('json rusak ditolak', !broken.ok);

const empty = await readJsonObject(
	fakeRequest(async () => {
		throw new SyntaxError('Unexpected end of JSON input');
	})
);
ok('body kosong ditolak', !empty.ok);

const nul = await readJsonObject(fakeRequest(async () => null));
ok('null ditolak', !nul.ok);

const arr = await readJsonObject(fakeRequest(async () => []));
ok('array ditolak', !arr.ok);

const str = await readJsonObject(fakeRequest(async () => 'nama'));
ok('string ditolak', !str.ok);

const num = await readJsonObject(fakeRequest(async () => 42));
ok('angka ditolak', !num.ok);

console.log(`\n${passCount} passed, ${failCount} failed\n`);
if (failCount > 0) process.exit(1);

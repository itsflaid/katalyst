import { SubrequestBudget } from '../src/lib/server/domains/copilot/budget';

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

console.log('\n== budget ==');
{
  const b = new SubrequestBudget();
  ok('default 45', b.limit === 45 && b.used === 0 && b.remaining() === 45);
  b.spend();
  b.spend(4);
  ok('spend bertambah', b.used === 5 && b.remaining() === 40, `used=${b.used}`);
  ok('canAfford di batas', b.canAfford(40) && !b.canAfford(41));
  b.spend(40);
  ok('habis tepat di limit', b.used === 45 && b.remaining() === 0);
  let thrown = '';
  try {
    b.spend();
  } catch (e) {
    thrown = String(e);
  }
  ok('melewati batas melempar BUDGET_EXCEEDED', thrown.includes('BUDGET_EXCEEDED'), thrown);
  ok('gagal spend tidak menambah used', b.used === 45);
}

console.log(`\n${passCount} passed, ${failCount} failed\n`);
if (failCount > 0) process.exit(1);

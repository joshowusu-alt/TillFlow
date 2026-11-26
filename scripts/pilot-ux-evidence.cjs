/** Before/after browser evidence; isolated pilot fixture, no successful writes. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { openGuardedPrismaClient } = require('./lib/guarded-prisma.cjs');

async function main() {
  const phase = process.argv[2];
  assert(['before', 'after'].includes(phase));
  const baseURL = process.env.BASE_URL;
  assert(['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname));
  const fixture = JSON.parse(fs.readFileSync(process.env.PILOT_FIXTURE_PATH || 'tmp/pilot-acceptance.json', 'utf8'));
  assert.match(fixture.run, /^pilot-/);
  const { prisma } = await openGuardedPrismaClient({ url: process.env.TILLFLOW_TEST_DATABASE_URL });
  const browser = await chromium.launch();
  const output = 'tmp/pilot-ux-evidence';
  fs.mkdirSync(output, { recursive: true });
  async function session(role) {
    const ctx = await browser.newContext({ baseURL, serviceWorkers: 'block', viewport: { width: 1280, height: 1600 } });
    const page = await ctx.newPage();
    await page.goto('/login');
    await page.locator('input[name=email]').fill(fixture.users[role].email);
    await page.locator('input[name=password]').fill(fixture.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 60000 });
    await ctx.addCookies([{ name: 'tillflow_operational_store', value: fixture.stores[0].id, url: baseURL }]);
    return { ctx, page };
  }
  try {
    const business = await prisma.business.findUniqueOrThrow({ where: { id: fixture.businessId } });
    assert.match(business.name, /^FICTIONAL/);
    const shift = await prisma.shift.findUniqueOrThrow({ where: { id: fixture.stores[0].shiftId } });
    assert.equal(shift.status, 'OPEN');
    assert.equal(shift.expectedCashPence, 20000);
    const cashier = await session('cashier1');
    try {
      const page = cashier.page;
      await page.goto('/shifts');
      await page.getByRole('button', { name: 'Close Shift', exact: true }).click();
      await page.getByLabel('Actual Cash Counted').fill('120.00');
      await page.getByLabel('Reason details').fill('Fictional cash count checked');
      const modal = page.locator('.overlay-shell').filter({ has: page.locator('#actual-cash-counted') });
      await modal.getByPlaceholder('Enter manager approval PIN').waitFor();
      assert.equal(await modal.locator('[data-close-shift]').isEnabled(), false);
      const expected = phase === 'before' ? 'GH₵-80.00' : '-GH₵80.00';
      await modal.getByText(expected, { exact: true }).waitFor();
      assert.equal(await modal.getByText('Enter the manager PIN to close this shift.', { exact: true }).count(), phase === 'after' ? 1 : 0);
      await modal.locator('form').screenshot({ path: `${output}/close-${phase}.png` });
    } finally { await cashier.ctx.close(); }
    const owner = await session('owner');
    try {
      const page = owner.page;
      await page.goto('/users');
      await page.locator('input[name=name]').fill('Fictional duplicate');
      await page.locator('input[name=email]').fill(fixture.users.cashier1.email);
      await page.locator('input[name=password]').fill(fixture.password);
      await page.getByRole('button', { name: 'Create User', exact: true }).click();
      await page.getByText(phase === 'before' ? 'An error occurred.' : 'A user with that email already exists.', { exact: true }).waitFor({ timeout: 15000 });
      await page.locator('input[name=password]').fill('');
      await page.screenshot({ path: `${output}/add-user-${phase}.png`, fullPage: true });
      assert.equal(await prisma.user.count({ where: { email: fixture.users.cashier1.email } }), 1);
    } finally { await owner.ctx.close(); }
    assert.equal((await prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).status, 'OPEN');
    console.log(`PASS ${phase} UX evidence captured; no cash close or duplicate user committed`);
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

/** End-to-end cash close and owner review evidence on a dedicated isolated pilot fixture. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { openGuardedPrismaClient } = require('./lib/guarded-prisma.cjs');
const { createPilotFixture } = require('./pilot-acceptance-fixture.cjs');

async function main() {
  const baseURL = process.env.BASE_URL;
  assert(['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname));
  assert(process.env.TILLFLOW_TEST_DATABASE_URL, 'Explicit isolated database required');
  const { prisma, identity } = await openGuardedPrismaClient({ url: process.env.TILLFLOW_TEST_DATABASE_URL });
  assert.equal(identity.database, 'tillflow_ci_pilot', 'Disposable CI database only');
  const fixture = await createPilotFixture(prisma, `pilot-close-review-${Date.now()}`);
  await prisma.business.update({ where: { id: fixture.businessId }, data: { onboardingCompletedAt: new Date(), shiftCloseApprovalThresholdPence: 5000 } });
  const browser = await chromium.launch();
  const output = 'tmp/pilot-ux-evidence';
  fs.mkdirSync(output, { recursive: true });
  async function session(role, storeId) {
    const ctx = await browser.newContext({ baseURL, serviceWorkers: 'block', viewport: { width: 1280, height: 1400 } });
    const page = await ctx.newPage();
    await page.goto('/login');
    await page.locator('input[name=email]').fill(fixture.users[role].email);
    await page.locator('input[name=password]').fill(fixture.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 60000 });
    await ctx.addCookies([{ name: 'tillflow_operational_store', value: storeId, url: baseURL }]);
    return { ctx, page };
  }
  try {
    const store = fixture.stores[0];
    const cashier = await session('cashier1', store.id);
    try {
      const page = cashier.page;
      await page.goto('/shifts');
      await page.getByRole('button', { name: 'Close Shift', exact: true }).click();
      await page.getByLabel('Actual Cash Counted').fill('120.00');
      const modal = page.locator('.overlay-shell').filter({ has: page.locator('#actual-cash-counted') });
      await modal.getByText('-GH₵80.00', { exact: true }).waitFor();
      await modal.getByText('Large', { exact: true }).waitFor();
      assert.equal(await modal.locator('[data-close-shift]').isEnabled(), false, 'Reason required');
      await modal.locator('#close-shift-variance-reason').selectOption('MISSING_CASH');
      await modal.getByLabel('Reason details').fill('Fictional count checked');
      assert.equal(await modal.locator('input[type=password]').count(), 0);
      assert.equal(await modal.locator('[data-close-shift]').isEnabled(), true);
      await modal.locator('form').screenshot({ path: `${output}/close-shortage.png` });
      await modal.locator('[data-close-shift]').click();
      await page.getByText(/Shift Closed/).waitFor();
    } finally { await cashier.ctx.close(); }

    const closed = await prisma.shift.findUniqueOrThrow({ where: { id: store.shiftId } });
    assert.equal(closed.status, 'CLOSED');
    assert.equal(closed.variance, -8000);
    assert.equal(closed.closeManagerApprovalMode, 'SELF');
    assert.equal(closed.closeManagerApprovedByUserId, null);
    assert.equal(closed.actualCashPence, 12000);
    const investigation = await prisma.cashVarianceInvestigation.findUniqueOrThrow({ where: { shiftId: closed.id } });
    assert.equal(investigation.status, 'OPEN');
    assert.equal(investigation.cashierExplanation, 'Fictional count checked');
    // Start on a different active branch: Home must lead to the authorised
    // branch's actual review, not a 404 or stale mutation.
    const owner = await session('owner', fixture.stores[1].id);
    try {
      const page = owner.page;
      await page.goto('/home');
      const card = page.getByTestId('home-cash-differences');
      await card.getByRole('heading', { name: 'Needs your attention' }).waitFor();
      await card.getByText('-GH₵80.00', { exact: true }).waitFor();
      await card.getByText('Large', { exact: true }).waitFor();
      await card.getByText('Fictional cashier1', { exact: true }).waitFor();
      await card.getByText('Missing cash — Fictional count checked', { exact: true }).waitFor();
      await card.screenshot({ path: `${output}/owner-home-card.png` });
      await card.getByRole('button', { name: /Fictional cashier1/ }).click();
      await page.waitForURL(url => url.pathname === `/shifts/variance/${investigation.id}`);
      assert(await page.getByRole('button', { name: 'Close review with findings', exact: true }).isDisabled());
      await page.getByLabel('What did you check and conclude?').fill('Fictional owner checked the closing count and drawer transactions');
      await page.getByRole('button', { name: 'Close review with findings', exact: true }).click();
      await page.getByText(/Reviewed by Fictional owner/).waitFor();
      const reviewed = await prisma.cashVarianceInvestigation.findUniqueOrThrow({ where: { id: investigation.id } });
      assert.equal(reviewed.status, 'APPROVED');
      assert.equal(reviewed.reviewedByUserId, fixture.users.owner.id);
      assert(reviewed.reviewedAt);
      await page.goto('/home');
      await page.getByRole('heading', { name: /^FICTIONAL/ }).waitFor();
      await card.waitFor({ state: 'hidden' });
      await page.waitForLoadState('networkidle');
      assert.equal(await card.count(), 0, 'Reviewed item must disappear from Home');
    } finally { await owner.ctx.close(); }
    console.log('PASS large self-close with reason, red flag, cross-branch owner Home review, reviewed card hidden');
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

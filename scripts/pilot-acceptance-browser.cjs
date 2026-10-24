/** Real password login + browser checkout, against a guarded fictional fixture only. */
const { chromium } = require('playwright');
const { openGuardedPrismaClient } = require('./lib/guarded-prisma.cjs');
const fs = require('node:fs');
const assert = require('node:assert/strict');
async function main() {
  const baseURL = process.env.BASE_URL || 'http://localhost:6200';
  if (!['localhost','127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Pilot acceptance only targets a local isolated server');
  const fixture = JSON.parse(fs.readFileSync(process.env.PILOT_FIXTURE_PATH || 'tmp/pilot-acceptance.json', 'utf8'));
  if (!fixture.run?.startsWith('pilot-')) throw new Error('Dedicated fictional pilot fixture required');
  const { prisma } = await openGuardedPrismaClient({ url: process.env.TILLFLOW_TEST_DATABASE_URL });
  const business = await prisma.business.findUniqueOrThrow({ where: { id: fixture.businessId } });
  assert.match(business.name, /^FICTIONAL/);
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const [index, role] of ['owner','manager','cashier1','cashier2'].entries()) {
      const context = await browser.newContext({ baseURL, serviceWorkers: 'block', viewport: role === 'cashier1' ? { width: 390, height: 844 } : role === 'cashier2' ? { width: 768, height: 1024 } : { width: 1280, height: 900 } });
      try {
        const page = await context.newPage();
        await page.goto('/login');
        await page.locator('input[name=email]').fill(fixture.users[role].email);
        await page.locator('input[name=password]').fill(fixture.password);
        await page.getByRole('button', { name: /sign in/i }).click();
        await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 60000 });
        const cookies = await context.cookies();
        assert(cookies.some(cookie => cookie.name === `pos_session_${fixture.businessId}` && cookie.httpOnly));
        results.push(`PASS real password login ${role}`);
        const store = fixture.stores[role === 'cashier2' ? 1 : 0];
        // Device branch selection, never an authentication/session cookie forgery.
        await context.addCookies([{ name: 'tillflow_operational_store', value: store.id, url: baseURL }]);
        if (role.startsWith('cashier')) {
          const before = await prisma.salesInvoice.count({ where: { businessId: fixture.businessId, cashierUserId: fixture.users[role].id } });
          await page.goto('/pos');
          const barcode = page.getByRole('textbox', { name: 'Scan barcode', exact: true });
          await barcode.fill(fixture.products[index - 2].barcode);
          await barcode.press('Enter');
          const add = page.getByRole('button', { name: /Add to Cart/i });
          const exact = page.getByRole('button', { name: /^Exact$/ });
          const cartMode = await Promise.race([
            add.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'staged'),
            exact.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'direct'),
          ]);
          if (cartMode === 'staged') await add.click();
          const till = page.locator('#pos-till-select');
          await till.waitFor({ state: 'visible' });
          await till.selectOption(store.tillId);
          await exact.click();
          const complete = page.getByRole('button', { name: /Complete (?:Cash |Part-Paid |Credit )?Sale/i }).first();
          await complete.click();
          await page.getByText(/Sale Complete!/i).waitFor({ timeout: 45000 });
          assert.equal(await prisma.salesInvoice.count({ where: { businessId: fixture.businessId, cashierUserId: fixture.users[role].id } }), before + 1);
          const sale = await prisma.salesInvoice.findFirstOrThrow({ where: { businessId: fixture.businessId, cashierUserId: fixture.users[role].id }, orderBy: { createdAt: 'desc' }, include: { payments: true } });
          assert.equal(sale.totalPence, 5000);
          assert.equal(sale.payments.reduce((sum, p) => sum + p.amountPence, 0), 5000);
          assert.equal((await prisma.shift.findUniqueOrThrow({ where: { id: store.shiftId } })).expectedCashPence, 25000);
          await page.goto(`/receipts/${sale.id}`);
          assert.match(await page.locator('body').innerText(), /50[.,]00/);
          results.push(`PASS barcode keyboard checkout, receipt and persisted cash ${role}`);
          await page.goto('/suppliers');
          assert(!new URL(page.url()).pathname.startsWith('/suppliers'), 'Cashier must not read supplier management');
          results.push(`PASS cashier supplier-route denial ${role}`);
        } else {
          for (const route of ['/products','/purchases','/suppliers','/reports/dashboard']) {
            await page.goto(route);
            const body = await page.locator('body').innerText();
            assert(!/Application error|server-side exception|Unhandled Runtime Error/i.test(body), `${role} ${route}`);
            assert(!new URL(page.url()).pathname.startsWith('/login'), `${role} session lost`);
          }
          results.push(`PASS protected business pages ${role}`);
        }
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), `${role} horizontal overflow`);
        results.push(`PASS viewport geometry ${role}`);
      } finally { await context.close(); }
    }
    const entries = await prisma.journalEntry.findMany({ where: { businessId: fixture.businessId }, include: { lines: true } });
    assert.equal(entries.filter(entry => entry.lines.reduce((s, l) => s + l.debitPence - l.creditPence, 0) !== 0).length, 0);
    results.push('PASS every fictional-business journal balanced after browser checkouts');
    console.log(JSON.stringify({ passed: results.length, failed: 0, results, simulations: ['MoMo/provider settlement is not exercised by this browser harness'], gaps: ['Physical barcode scanner, physical receipt printer, and actual provider settlement require pilot device/provider acceptance'] }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ passed: results.length, failed: 1, results, error: error.message }, null, 2));
    process.exitCode = 1;
  } finally { await browser.close(); await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

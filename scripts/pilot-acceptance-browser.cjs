/** Real password login + browser checkout, against a guarded fictional fixture only. */
const { chromium } = require('playwright');
const { openGuardedPrismaClient } = require('./lib/guarded-prisma.cjs');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const Module = require('node:module');
function offlineHasher() {
  const compiled = require('esbuild').transformSync(fs.readFileSync('lib/offline/payload-hash.ts', 'utf8'), { loader: 'ts', format: 'cjs', target: 'node22' }).code;
  const helper = new Module('pilot-offline-hash');
  helper._compile(compiled, 'pilot-offline-hash.cjs');
  return helper.exports.hashOfflineSalePayload;
}
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
    // Registration and first cashier setup go through public/owner forms, not fixture writes.
    const registration = await browser.newContext({ baseURL, serviceWorkers: 'block' });
    try {
      const page = await registration.newPage();
      const email = `registered-${fixture.run}@example.invalid`;
      const cashierEmail = `first-cashier-${fixture.run}@example.invalid`;
      await page.goto('/register');
      await page.locator('#register-business').fill(`FICTIONAL registered ${fixture.run}`);
      await page.locator('#register-owner').fill('Fictional Registered Owner');
      await page.getByRole('button', { name: 'Next — Account Details' }).click();
      await page.locator('#register-email').fill(email);
      await page.locator('#register-password').fill(fixture.password);
      await page.getByRole('button', { name: 'Next — Choose Plan' }).click();
      await page.getByRole('button', { name: /^Pro\b/ }).click();
      await page.getByRole('button', { name: 'Next — Currency' }).click();
      await page.locator('#register-currency').selectOption('GHS');
      await page.getByRole('button', { name: 'Create My Business' }).click();
      await page.waitForURL('**/getting-started', { timeout: 60000 });
      const owner = await prisma.user.findFirstOrThrow({ where: { email }, include: { business: true } });
      assert.equal(owner.role, 'OWNER');
      assert.equal(owner.business.currency, 'GHS');
      assert.equal(owner.business.plan, 'PRO');
      assert(owner.business.trialEndsAt > new Date());
      assert.equal(await prisma.store.count({ where: { businessId: owner.businessId } }), 1);
      assert.equal(await prisma.till.count({ where: { store: { businessId: owner.businessId } } }), 2);
      assert(await prisma.account.count({ where: { businessId: owner.businessId } }) > 0);
      assert.equal(await prisma.controlBusinessProfile.count({ where: { businessId: owner.businessId } }), 1);
      assert((await registration.cookies()).some(cookie => cookie.name === `pos_session_${owner.businessId}` && cookie.httpOnly));
      results.push('PASS public business registration, live owner session, trial and required bootstrap persisted');
      await page.goto('/users');
      await page.locator('input[name=name]').fill('Fictional First Cashier');
      await page.locator('input[name=email]').fill(cashierEmail);
      await page.locator('input[name=password]').fill(fixture.password);
      await page.locator('select[name=role]').selectOption('CASHIER');
      const creationForm = page.locator('form').filter({ has: page.locator('input[name=email]') });
      assert.equal(await creationForm.evaluate(form => form.checkValidity()), true, 'First cashier form must pass native validation');
      await Promise.all([
        page.waitForURL(url => url.pathname === '/users' && (url.searchParams.has('success') || url.searchParams.has('error')), { timeout: 45000 }),
        page.getByRole('button', { name: 'Create User', exact: true }).click(),
      ]);
      const creationError = new URL(page.url()).searchParams.get('error');
      assert.equal(creationError, null, `First cashier creation rejected: ${creationError}`);
      try {
        await page.getByText('User created successfully.', { exact: true }).waitFor({ timeout: 15000 });
      } catch (error) {
        const persisted = await prisma.user.findFirst({ where: { email: cashierEmail }, select: { active: true, role: true } });
        throw new Error(`First-cashier feedback missing: ${JSON.stringify({ path: new URL(page.url()).pathname, success: new URL(page.url()).searchParams.get('success'), persisted, visiblePage: (await page.locator('body').innerText()).slice(0, 1200) })}`);
      }
      const cashier = await prisma.user.findFirstOrThrow({ where: { email: cashierEmail } });
      assert.equal(cashier.businessId, owner.businessId);
      assert.equal(cashier.role, 'CASHIER');
      assert.equal(cashier.active, true);
      results.push('PASS first cashier created through newly registered owner UI');
      const firstLogin = await browser.newContext({ baseURL, serviceWorkers: 'block' });
      try {
        const firstPage = await firstLogin.newPage();
        await firstPage.goto('/login');
        await firstPage.locator('input[name=email]').fill(cashierEmail);
        await firstPage.locator('input[name=password]').fill(fixture.password);
        await firstPage.getByRole('button', { name: /sign in/i }).click();
        await firstPage.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 60000 });
        assert((await firstLogin.cookies()).some(cookie => cookie.name === `pos_session_${owner.businessId}` && cookie.httpOnly));
        await firstPage.goto('/users');
        assert.notEqual(new URL(firstPage.url()).pathname, '/users');
        results.push('PASS newly onboarded cashier password login and owner-route denial');
      } finally { await firstLogin.close(); }

    } finally { await registration.close(); }
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
          if (role === 'cashier2') {
            const beforeStock = await prisma.inventoryBalance.aggregate({ where: { store: { businessId: fixture.businessId } }, _sum: { qtyOnHandBase: true } });
            const beforeSales = await prisma.salesInvoice.count({ where: { businessId: fixture.businessId } });
            const beforeJournals = await prisma.journalEntry.count({ where: { businessId: fixture.businessId } });
            const old = new Date(Date.now() - 10 * 86400000);
            try {
              await prisma.business.update({ where: { id: fixture.businessId }, data: { currentPeriodEndsAt: old, nextBillingDate: old, nextPaymentDueAt: old, paymentGraceEndsAt: old, suspendedAt: old, subscriptionStatus: 'SUSPENDED', planStatus: 'SUSPENDED' } });
              const payload = { id: `expired-${fixture.run}`, idempotencyKey: `expired-${fixture.run}`, businessId: fixture.businessId, storeId: store.id, tillId: store.tillId, shiftId: store.shiftId, cashierUserId: fixture.users[role].id, customerId: null, paymentStatus: 'PAID', lines: [{ productId: fixture.products[0].id, unitId: fixture.unitId, qtyInUnit: 1, discountType: 'NONE', discountValue: '' }], payments: [{ method: 'CASH', amountPence: 5000 }], orderDiscountType: 'NONE', orderDiscountValue: '', createdAt: new Date().toISOString() };
              payload.payloadHash = await offlineHasher()(payload);
              const response = await page.request.post(`${baseURL}/api/offline/sync-sale`, { data: payload, headers: { origin: baseURL } });
              assert.equal(response.status(), 400);
              assert.equal((await response.json()).reason, 'read_only');
              assert.equal(await prisma.salesInvoice.count({ where: { businessId: fixture.businessId } }), beforeSales);
              assert.equal(await prisma.journalEntry.count({ where: { businessId: fixture.businessId } }), beforeJournals);
              assert.deepEqual(await prisma.inventoryBalance.aggregate({ where: { store: { businessId: fixture.businessId } }, _sum: { qtyOnHandBase: true } }), beforeStock);
              results.push('PASS expired subscription authenticated HTTP write denial; sales, stock and journal unchanged');
            } finally {
              await prisma.business.update({ where: { id: fixture.businessId }, data: { currentPeriodEndsAt: business.currentPeriodEndsAt, nextBillingDate: business.nextBillingDate, nextPaymentDueAt: business.nextPaymentDueAt, paymentGraceEndsAt: business.paymentGraceEndsAt, suspendedAt: business.suspendedAt, subscriptionStatus: business.subscriptionStatus, planStatus: business.planStatus } });
            }
          }
          await page.goto('/suppliers');
          assert(!new URL(page.url()).pathname.startsWith('/suppliers'), 'Cashier must not read supplier management');
          results.push(`PASS cashier supplier-route denial ${role}`);
        } else {
          if (role === 'owner') {
            const beforeStock = await prisma.inventoryBalance.aggregate({ where: { store: { businessId: fixture.businessId } }, _sum: { qtyOnHandBase: true } });
            const beforeJournals = await prisma.journalEntry.count({ where: { businessId: fixture.businessId } });
            const unit = await prisma.unit.findUniqueOrThrow({ where: { id: fixture.unitId } });
            const XLSX = require('xlsx');
            const book = XLSX.utils.book_new();
            const name = `Fictional imported gari ${fixture.run}`;
            XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ name, barcode: `IMPORT-${fixture.run}`, category: 'Fictional groceries', selling_price: 20, cost_price: 10, base_unit: unit.name }]), 'Products');
            const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
            await page.goto('/settings/import-stock?mode=CATALOGUE');
            await page.getByTestId('import-stock-file-input').setInputFiles({ name: 'fictional-catalogue.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
            await page.getByRole('button', { name: /Confirm Import/i }).click({ timeout: 45000 });
            await page.getByText('Import complete!', { exact: true }).waitFor({ timeout: 60000 });
            assert.equal(await prisma.product.count({ where: { businessId: fixture.businessId, name } }), 1);
            assert.equal(await prisma.journalEntry.count({ where: { businessId: fixture.businessId } }), beforeJournals);
            assert.deepEqual(await prisma.inventoryBalance.aggregate({ where: { store: { businessId: fixture.businessId } }, _sum: { qtyOnHandBase: true } }), beforeStock);
            results.push('PASS real workbook upload and catalogue import; no stock or journal movement');
          }
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

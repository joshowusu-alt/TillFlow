/** Two production builds, one browser origin, native IndexedDB, real PostgreSQL. */
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require('playwright');
const { openGuardedPrismaClient } = require('./lib/guarded-prisma.cjs');
const { createPilotFixture } = require('./pilot-acceptance-fixture.cjs');

async function bundle(root) {
  return (await build({ stdin: { contents: "import * as storage from './lib/offline/storage'; import * as sync from './lib/offline/sync'; import {hashOfflineSalePayload as hash} from './lib/offline/payload-hash'; window.rollbackAudit={storage,sync,hash};", resolveDir: root, loader: 'ts' }, bundle: true, write: false, platform: 'browser', format: 'iife', alias: { '@': root }, external: ['crypto'] })).outputFiles[0].text;
}
async function main() {
  assert.equal(process.env.CI, 'true', 'Isolated CI only');
  const dbURL = new URL(process.env.TILLFLOW_TEST_DATABASE_URL);
  assert(['localhost', '127.0.0.1'].includes(dbURL.hostname));
  assert.equal(dbURL.pathname, '/tillflow_ci_pilot');
  const fallbackRoot = path.resolve(process.env.TILLFLOW_FALLBACK_ROOT || '.pilot-fallback');
  assert(fs.existsSync(path.join(fallbackRoot, '.next/BUILD_ID')), 'An independent fallback production build is required');
  assert(fs.existsSync('.next/BUILD_ID'), 'Candidate production build is required');
  const bundles = { candidate: await bundle(process.cwd()), fallback: await bundle(fallbackRoot) };
  const { prisma } = await openGuardedPrismaClient({ url: dbURL.toString() });
  let browser, proxy;
  const state = { variant: 'candidate', outage: true, loseAck: false, lost: 0 };
  const results = [];
  try {
    const f = await createPilotFixture(prisma, `pilot-rollback-${Date.now()}`);
    const other = await createPilotFixture(prisma, `pilot-other-${Date.now()}`);
    proxy = http.createServer((req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      // NextRequest.nextUrl uses the upstream server's authority. This local
      // adapter checks the real browser origin first, then translates authority
      // consistently for upstream CSRF. Do not weaken application CSRF rules.
      const mutating = ['POST','PUT','PATCH','DELETE'].includes(req.method);
      if (mutating && req.headers.origin !== 'http://127.0.0.1:6202') {
        req.resume(); res.writeHead(403); res.end('{}'); return;
      }
      if (req.url === '/__rollback') { res.end('<!doctype html><title>Isolated rollback</title><body>Offline recovery harness</body>'); return; }
      if (req.url === '/__rollback.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundles[state.variant]); return; }
      // Deliberately unavailable batch route exercises the genuine single-sale fallback.
      if (req.url === '/api/offline/batch-sync') { req.resume(); res.writeHead(404); res.end('{}'); return; }
      const salePost = req.url === '/api/offline/sync-sale' && req.method === 'POST';
      if (salePost && state.outage) { req.resume(); res.writeHead(503); res.end('{}'); return; }
      const port = state.variant === 'candidate' ? 6200 : 6201;
      const authority = `127.0.0.1:${port}`;
      const headers = { ...req.headers, host: authority, 'x-forwarded-host': authority, 'x-forwarded-proto': 'http' };
      if (req.headers.origin) headers.origin = `http://${authority}`;
      if (req.headers.referer) headers.referer = `http://${authority}${new URL(req.headers.referer).pathname}`;
      const upstream = http.request({ hostname: '127.0.0.1', port, path: req.url, method: req.method, headers }, response => {
        if (salePost && state.loseAck && response.statusCode === 200) {
          // Let the real server commit, but the gateway times out before it can
          // acknowledge that commit. A bare TCP close can be transparently
          // retried by Chromium, which would not leave an uncertain queued sale.
          state.loseAck = false; response.resume();
          response.on('end', () => { state.lost++; res.writeHead(504, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Simulated gateway timeout after upstream commit' })); }); return;
        }
        res.writeHead(response.statusCode, { ...response.headers, 'x-tested-build': state.variant }); response.pipe(res);
      });
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); }); req.pipe(upstream);
    });
    // Use an existing allowed local Server Action origin, just as both builds
    // use6200/6201. A random proxy port is not an approved login origin.
    await new Promise((resolve,reject) => { proxy.once('error',reject); proxy.listen(6202, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${proxy.address().port}`;
    browser = await chromium.launch();
    const context = await browser.newContext({ baseURL: origin, serviceWorkers: 'block' });
    const page = await context.newPage();
    const denied = await context.request.post('/api/offline/sync-sale', { headers: { origin: 'https://untrusted.example' }, data: {} });
    assert.equal(denied.status(), 403);
    const directDenied = await context.request.post('http://127.0.0.1:6200/api/offline/sync-sale', { headers: { origin: 'https://untrusted.example' }, data: {} });
    assert.equal(directDenied.status(),403);
    results.push('PASS adapter and unmodified application independently refuse foreign-origin financial requests');
    const login = async (user, fixture = f) => {
      await page.goto('/login');
      await page.locator('input[name=email]').fill(user.email);
      await page.locator('input[name=password]').fill(fixture.password);
      await page.getByRole('button', { name: /sign in/i }).click();
      await page.waitForURL(url => !url.pathname.startsWith('/login'));
      await context.addCookies([{ name: 'tillflow_operational_store', value: fixture.stores[0].id, url: origin }]);
    };
    await login(f.users.cashier1);
    const load = async variant => {
      state.variant = variant;
      const live = await context.request.get('/pos');
      assert.equal(live.status(), 200); assert.equal(live.headers()['x-tested-build'], variant);
      await page.goto('/__rollback'); await page.addScriptTag({ url: '/__rollback.js' });
    };
    const pending = () => page.evaluate(() => window.rollbackAudit.storage.getPendingSales());
    const capture = () => page.evaluate(async f => window.rollbackAudit.storage.queueOfflineSale({
      businessId: f.businessId, storeId: f.stores[0].id, tillId: f.stores[0].tillId, shiftId: f.stores[0].shiftId,
      cashierUserId: f.users.cashier1.id, customerId: null, paymentStatus: 'PAID',
      lines: [{ productId: f.products[0].id, unitId: f.unitId, qtyInUnit: 1, discountType: 'NONE', discountValue: '' }],
      payments: [{ method: 'CASH', amountPence: 5000 }], orderDiscountType: 'NONE', orderDiscountValue: '', createdAt: new Date().toISOString(),
    }), f);
    const sync = () => page.evaluate(() => window.rollbackAudit.sync.syncOfflineSales());
    await load('candidate');
    const firstId = await capture(); const first = (await pending())[0];
    assert.equal((await sync()).failed, 1);
    assert.equal(await prisma.salesInvoice.count({ where: { businessId: f.businessId } }), 0);
    results.push('PASS unavailable network retains unsynced capture with zero persisted financial effects');
    state.outage = false; state.loseAck = true;
    const uncertain = await sync();
    assert.equal(uncertain.failed, 1, 'Gateway timeout must retain the uncertain sale');
    assert.equal(state.lost, 1, 'Real upstream must have committed before lost acknowledgement');
    assert.equal(await prisma.salesInvoice.count({ where: { businessId: f.businessId, externalRef: `OFFLINE_SYNC:${firstId}` } }), 1);
    assert.deepEqual((await pending())[0], first);
    results.push('PASS lost acknowledgement after real PostgreSQL commit preserves original replay identity');
    state.outage = true;
    const secondId = await capture(); const saved = await pending();
    await page.evaluate(async ({ f, other }) => {
      const { storage } = window.rollbackAudit;
      for (const [index, store] of f.stores.entries()) await storage.cacheProducts({ businessId: f.businessId, storeId: store.id }, [{ ...f.products[0], businessId: f.businessId, storeId: store.id, onHandBase: index ? 73 : 99, units: [] }]);
      const otherSale = { ...((await storage.getPendingSales())[0]), id: 'other-tenant-pending', idempotencyKey: 'other-tenant-pending', businessId: other.businessId, storeId: other.stores[0].id, tillId: other.stores[0].tillId, shiftId: other.stores[0].shiftId, cashierUserId: other.users.cashier1.id, lines: [{ productId: other.products[0].id, unitId: other.unitId, qtyInUnit: 1, discountType: 'NONE', discountValue: '' }] };
      otherSale.payloadHash = await window.rollbackAudit.hash(otherSale);
      await (await storage.getDB()).put('salesQueue', otherSale);
    }, { f, other });
    await load('fallback');
    assert.deepEqual(await pending(), saved);
    const cache = await page.evaluate(async f => Promise.all(f.stores.map(s => window.rollbackAudit.storage.getCachedProducts(f.businessId, s.id))), f);
    assert.deepEqual(cache.map(rows => rows[0].onHandBase), [99, 73]);
    assert.equal((await pending()).some(row => row.businessId === other.businessId), false);
    results.push('PASS independently built fallback retains both pending sales, tenant isolation and distinct store stock');
    state.outage = false;
    const recovered = await sync(); assert.equal(recovered.synced, 2); assert.equal(recovered.failed, 0);
    assert.equal((await pending()).length, 0);
    results.push('PASS fallback replays committed winner once and completes previously uncommitted sale');
    await load('candidate'); assert.equal((await sync()).synced, 0);
    const invoices = await prisma.salesInvoice.findMany({ where: { businessId: f.businessId }, include: { payments: true } });
    assert.equal(invoices.length, 2); assert.deepEqual(invoices.map(i => i.externalRef).sort(), [firstId, secondId].map(id => `OFFLINE_SYNC:${id}`).sort());
    assert(invoices.every(i => i.payments.length === 1 && i.payments[0].amountPence === 5000));
    const invoiceIds = invoices.map(i => i.id);
    assert.equal(await prisma.stockMovement.count({ where: { referenceId: { in: invoiceIds }, type: 'SALE' } }), 2);
    assert.equal(await prisma.cashDrawerEntry.count({ where: { businessId: f.businessId, entryType: 'CASH_SALE' } }), 2);
    assert.equal((await prisma.inventoryBalance.findUniqueOrThrow({ where: { storeId_productId: { storeId: f.stores[0].id, productId: f.products[0].id } } })).qtyOnHandBase, 98);
    assert.equal((await prisma.shift.findUniqueOrThrow({ where: { id: f.stores[0].shiftId } })).expectedCashPence, 30000);
    const entries = await prisma.journalEntry.findMany({ where: { businessId: f.businessId }, include: { lines: true } });
    assert.equal(entries.filter(j => invoiceIds.includes(j.referenceId)).length, 2);
    assert(entries.every(j => j.lines.reduce((n, l) => n + l.debitPence - l.creditPence, 0) === 0));
    assert.equal(await prisma.salesInvoice.count({ where: { businessId: other.businessId } }), 0);
    results.push('PASS candidate restoration has exactly two invoices/payments/stock reductions/drawer receipts and balanced sale journals');

    // Configure a separate food business before either build reads its
    // checkout context: changing an already-cached retail business directly
    // through the fixture DB would not exercise valid food checkout.
    const food = await createPilotFixture(prisma, `pilot-food-rollback-${Date.now()}`);
    await prisma.business.update({ where: { id: food.businessId }, data: { businessCategory: 'FOOD_DISHES' } });
    const dish = await prisma.foodDish.create({ data: {
      businessId: food.businessId, productId: food.products[1].id, stockMode: 'NOT_COUNTED',
      allowCustomAmount: true,
      sizes: { create: [{ name: 'Small', pricePence: 3000, isDefault: true }, { name: 'Large', pricePence: 3500 }] },
      groups: { create: { name: 'Extras', selection: 'MANY', required: false,
        addons: { create: { name: 'Extra', pricePence: 500, maxQty: 2, stockPortions: 0 } },
      } },
    }, include: { sizes: true, groups: { include: { addons: true } } } });
    const small = dish.sizes.find(s => s.name === 'Small');
    const large = dish.sizes.find(s => s.name === 'Large');
    const addon = dish.groups[0].addons[0];
    const foodCases = [
      { name: 'size', amount: 3000, plate: { sizeId: small.id, addons: [], expectedPricePence: 3000 } },
      { name: 'size and add-on', amount: 4000, plate: { sizeId: large.id, addons: [{ addonId: addon.id, qty: 1 }], expectedPricePence: 4000 } },
      { name: 'custom amount and add-on', amount: 3200, plate: { sizeId: null, customAmountPence: 2700, addons: [{ addonId: addon.id, qty: 1 }], expectedPricePence: 3200 } },
    ];
    await context.clearCookies();
    await login(food.users.cashier1, food);
    for (const [writer, reader] of [['candidate', 'fallback'], ['fallback', 'candidate']]) {
      await load(writer);
      state.outage = true;
      const ids = [];
      for (const item of foodCases) {
        ids.push(await page.evaluate(({ f, item }) => window.rollbackAudit.storage.queueOfflineSale({
          businessId: f.businessId, storeId: f.stores[0].id, tillId: f.stores[0].tillId,
          shiftId: f.stores[0].shiftId, cashierUserId: f.users.cashier1.id, customerId: null,
          paymentStatus: 'PAID', lines: [{ productId: f.products[1].id, unitId: f.unitId,
            qtyInUnit: 1, unitPricePence: item.amount, lineSubtotalPence: item.amount,
            discountType: 'NONE', discountValue: '', plate: item.plate }],
          payments: [{ method: 'CASH', amountPence: item.amount }], orderDiscountType: 'NONE',
          orderDiscountValue: '', createdAt: new Date().toISOString(),
        }), { f: food, item }));
      }
      const captured = await pending();
      assert.equal(captured.length, 3);
      assert.equal((await sync()).failed, 3);
      await load(reader);
      assert.deepEqual(await pending(), captured, 'Queue identities and all plate fields survive switching builds');
      assert.equal(await page.evaluate(async () => {
        const { storage, hash } = window.rollbackAudit;
        const rows = await storage.getPendingSales();
        return (await Promise.all(rows.map(async row => row.payloadHash === await hash(row)))).every(Boolean);
      }), true);
      state.outage = false;
      const posted = await sync();
      assert.equal(posted.failed, 0, JSON.stringify(posted));
      assert.equal(posted.synced, 3);
      assert.equal((await pending()).length, 0);
      assert.equal((await sync()).synced, 0);
      for (const [index, id] of ids.entries()) {
        const invoice = await prisma.salesInvoice.findFirstOrThrow({
          where: { businessId: food.businessId, externalRef: `OFFLINE_SYNC:${id}` },
          include: { lines: true, payments: true },
        });
        assert.equal(await prisma.salesInvoice.count({ where: { businessId: food.businessId, externalRef: `OFFLINE_SYNC:${id}` } }), 1);
        assert.equal(invoice.totalPence, foodCases[index].amount);
        assert.equal(invoice.payments.length, 1);
        assert.equal(invoice.payments[0].amountPence, foodCases[index].amount);
        assert.equal(invoice.lines.length, 1);
        const snapshot = JSON.parse(invoice.lines[0].plateSnapshotJson);
        assert.equal(snapshot.sizeId, foodCases[index].plate.sizeId);
        assert.equal(snapshot.customAmountPence, foodCases[index].plate.customAmountPence);
        assert.deepEqual(snapshot.addons.map(a => ({ addonId: a.id, qty: a.qty })), foodCases[index].plate.addons);
      }
      results.push(`PASS ${writer} to ${reader}: sized plates, extras and custom amount replay exactly once with cash and plate snapshots intact`);
    }

    // Real candidate cashier close and manager review, then display through
    // the independent dfce423 application against exactly the same rows.
    await load('candidate');
    const beforeClose = await prisma.shift.findUniqueOrThrow({ where: { id: food.stores[0].shiftId } });
    const totalFoodCash = 2 * foodCases.reduce((sum, item) => sum + item.amount, 0);
    assert.equal(beforeClose.expectedCashPence, 20000 + totalFoodCash);
    await page.goto('/shifts');
    await page.getByRole('button', { name: 'Close Shift', exact: true }).click();
    await page.getByLabel('Actual Cash Counted').fill(((beforeClose.expectedCashPence - 8000) / 100).toFixed(2));
    await page.getByLabel('Reason details').fill('Fictional short count');
    assert.equal(await page.getByPlaceholder('Enter manager approval PIN').count(), 0);
    await page.getByText('Large', { exact: true }).waitFor();
    await page.locator('[data-close-shift]').click();
    await page.getByText(/Shift Closed/).waitFor();
    const closed = await prisma.shift.findUniqueOrThrow({ where: { id: beforeClose.id } });
    assert.equal(closed.status, 'CLOSED');
    assert.equal(closed.closeManagerApprovalMode, 'SELF');
    assert.equal(closed.closeManagerApprovedByUserId, null);
    assert.equal(closed.actualCashPence, beforeClose.expectedCashPence - 8000);
    assert.equal(closed.variance, -8000);
    assert.equal(JSON.parse(closed.closureSnapshotJson).closedBySelf, true);
    const investigation = await prisma.cashVarianceInvestigation.findUniqueOrThrow({ where: { shiftId: closed.id } });
    assert.equal(investigation.status, 'OPEN');
    assert.equal(investigation.cashierExplanation, 'Fictional short count');
    await context.clearCookies();
    await login(food.users.manager, food);
    const detail = `/shifts/variance/${investigation.id}`;
    await page.goto(detail);
    await page.getByLabel('What did you check and conclude?').fill('Fictional manager checked cash');
    await page.getByRole('button', { name: 'Close review with findings' }).click();
    await page.getByText(/Reviewed by Fictional manager/).waitFor();
    const reviewed = await prisma.cashVarianceInvestigation.findUniqueOrThrow({ where: { id: investigation.id } });
    assert.equal(reviewed.status, 'APPROVED');
    assert.equal(reviewed.reviewedByUserId, food.users.manager.id);
    assert.equal(reviewed.approvedByUserId, food.users.manager.id);
    assert(reviewed.reviewedAt);
    assert.equal(reviewed.reviewNote, 'Fictional manager checked cash');
    assert.equal(await prisma.auditLog.count({ where: { businessId: food.businessId, entityId: investigation.id, action: 'CASH_VARIANCE_REVIEW' } }), 1);
    state.variant = 'fallback';
    assert.equal((await page.goto(detail)).status(), 200);
    await page.getByText('APPROVED', { exact: true }).waitFor();
    await page.getByText(/Approved by Fictional manager/).waitFor();
    assert.equal(await page.getByRole('button', { name: /Assign|Save explanation|Record resolution|Approve variance/ }).count(), 0);
    assert.equal((await page.goto('/shifts')).status(), 200);
    assert.deepEqual(await prisma.shift.findUniqueOrThrow({ where: { id: closed.id } }), closed);
    assert.deepEqual(await prisma.cashVarianceInvestigation.findUniqueOrThrow({ where: { id: reviewed.id } }), reviewed);
    state.variant = 'candidate';
    assert.equal((await page.goto(detail)).status(), 200);
    await page.getByText(/Reviewed by Fictional manager/).waitFor();
    await page.getByText('Fictional manager checked cash').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Close review with findings' }).count(), 0);
    assert.deepEqual(await prisma.cashVarianceInvestigation.findUniqueOrThrow({ where: { id: reviewed.id } }), reviewed);
    results.push('PASS TIL5-C large SELF close and manager review survive dfce423 rollback and candidate restoration without re-opening, data loss or another approval');

    await page.goto('/__rollback'); await page.addScriptTag({ url: '/__rollback.js' });
    await context.clearCookies(); await page.reload(); await page.addScriptTag({ url: '/__rollback.js' });
    assert.equal((await pending()).length, 0);
    assert(await page.evaluate(async () => Boolean(await (await window.rollbackAudit.storage.getDB()).get('salesQueue', 'other-tenant-pending'))));
    results.push('PASS logged-out scope exposes no pending data and preserves another tenant pending record');
    await context.close();
    console.log('ROLLBACK_ACCEPTANCE '+JSON.stringify({ passed: results.length, failed: 0, candidateBuild: fs.readFileSync('.next/BUILD_ID','utf8').trim(), fallbackBuild: fs.readFileSync(path.join(fallbackRoot,'.next/BUILD_ID'),'utf8').trim(), persistedSales: 8, persistedPayments: 8, cashPence: closed.expectedCashPence, finalRetailStock: 98, results, limitations: 'Local production servers and native IndexedDB; proxy deliberately loses acknowledgement and disables batch. Service-worker migration/retry has separate native coverage. Not a Vercel promotion, Ghana-network or physical-device test.' }));
  } finally { if(browser) await browser.close(); if(proxy) await new Promise(resolve=>proxy.close(resolve)); await prisma.$disconnect(); }
}
main().catch(error=>{ console.error(error); process.exitCode=1; });

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
    await page.goto('/login');
    await page.locator('input[name=email]').fill(f.users.cashier1.email);
    await page.locator('input[name=password]').fill(f.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'));
    await context.addCookies([{ name: 'tillflow_operational_store', value: f.stores[0].id, url: origin }]);
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
    await context.clearCookies(); await page.reload(); await page.addScriptTag({ url: '/__rollback.js' });
    assert.equal((await pending()).length, 0);
    assert(await page.evaluate(async () => Boolean(await (await window.rollbackAudit.storage.getDB()).get('salesQueue', 'other-tenant-pending'))));
    results.push('PASS logged-out scope exposes no pending data and preserves another tenant pending record');
    await context.close();
    console.log('ROLLBACK_ACCEPTANCE '+JSON.stringify({ passed: results.length, failed: 0, candidateBuild: fs.readFileSync('.next/BUILD_ID','utf8').trim(), fallbackBuild: fs.readFileSync(path.join(fallbackRoot,'.next/BUILD_ID'),'utf8').trim(), persistedSales: 2, persistedPayments: 2, cashPence: 30000, finalStock: 98, results, limitations: 'Local production servers and native IndexedDB; proxy deliberately loses acknowledgement and disables batch. Service-worker migration/retry has separate native coverage. Not a Vercel promotion, Ghana-network or physical-device test.' }));
  } finally { if(browser) await browser.close(); if(proxy) await new Promise(resolve=>proxy.close(resolve)); await prisma.$disconnect(); }
}
main().catch(error=>{ console.error(error); process.exitCode=1; });

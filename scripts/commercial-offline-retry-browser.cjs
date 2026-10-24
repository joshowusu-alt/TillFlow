#!/usr/bin/env node
/** Native IndexedDB + actual client retry code; API settlement is explicitly simulated. */
const { build } = require('esbuild');
const { chromium } = require('playwright');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const root = path.resolve(__dirname, '..');
  const bundle = await build({
    stdin: { contents: "import * as storage from './lib/offline/storage'; import * as sync from './lib/offline/sync'; window.retryAudit = {storage, sync};", resolveDir: root, loader: 'ts' },
    bundle: true, write: false, platform: 'browser', format: 'iife', alias: { '@': root }, external: ['crypto'],
  });
  const state = { requests: [], commits: new Set() };
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (req.url === '/audit.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundle.outputFiles[0].text); return; }
    if (req.url === '/api/offline/batch-sync') { req.resume(); json(404, {}); return; }
    if (req.url === '/api/offline/sync-sale' && req.method === 'GET') {
      json(200, { cashierUserId: 'fictional-cashier', openShifts: [{ id: 'fictional-shift', tillId: 'fictional-till' }] }); return;
    }
    if (req.url === '/api/offline/sync-sale' && req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += chunk;
      const sale = JSON.parse(body); state.requests.push(sale.id);
      if (state.requests.length === 1) { json(503, { error: 'Simulated temporary outage' }); return; }
      const replay = state.commits.has(sale.id);
      state.commits.add(sale.id);
      // The second request commits in the simulated API, but its response is lost.
      if (state.requests.length === 2) { res.destroy(); return; }
      json(200, { status: replay ? 'already_synced' : 'synced' }); return;
    }
    if (req.url.startsWith('/api/')) { req.resume(); json(503, { error: 'Cache refresh omitted from retry fixture' }); return; }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><body>Fictional offline retry audit</body></html>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const results = [];
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    await page.evaluate(() => { document.cookie = 'pos_active_business=fictional-biz; path=/'; });
    await page.addScriptTag({ url: '/audit.js' });
    await page.evaluate(async () => {
      const db = await window.retryAudit.storage.getDB();
      await db.put('salesQueue', {
        id: 'fictional-sale', businessId: 'fictional-biz', storeId: 'fictional-store', tillId: 'fictional-till', shiftId: 'fictional-shift',
        cashierUserId: 'fictional-cashier', paymentStatus: 'PAID', lines: [], payments: [{ method: 'CASH', amountPence: 5000 }],
        orderDiscountType: 'NONE', orderDiscountValue: '', createdAt: new Date().toISOString(), localSaleTime: new Date().toISOString(),
        localSequence: 1, idempotencyKey: 'fictional-sale', payloadHash: 'simulated-api-only', synced: false, status: 'pending',
      });
    });
    const first = await page.evaluate(() => window.retryAudit.sync.syncOfflineSales());
    assert.equal(first.failed, 1); assert.equal(state.commits.size, 0);
    assert.equal(await page.evaluate(async () => (await window.retryAudit.storage.getPendingSales()).length), 1);
    results.push('PASS HTTP503 retains queued sale without a simulated money commit');

    // A real browser reload discards JS module memory; IndexedDB must retain the sale.
    await page.reload();
    await page.addScriptTag({ url: '/audit.js' });
    assert.equal(await page.evaluate(async () => (await window.retryAudit.storage.getPendingSales())[0].id), 'fictional-sale');
    results.push('PASS browser refresh preserves native IndexedDB pending sale');
    await page.evaluate(() => {
      window.retryResults = [];
      window.retryCleanup = window.retryAudit.sync.setupAutoSync(() => {}, (result) => window.retryResults.push(result), (error) => { window.retryError = error.message; });
    });
    await page.waitForFunction(() => window.retryResults?.some(result => result.synced === 1), null, { timeout: 15000 });
    await page.evaluate(() => window.retryCleanup());
    assert.equal(state.commits.size, 1);
    assert.ok(state.requests.length >= 3);
    assert.deepEqual([...new Set(state.requests)], ['fictional-sale']);
    assert.equal(await page.evaluate(async () => (await window.retryAudit.storage.getPendingSales()).length), 0);
    results.push('PASS lost response retries the same sale identity and simulated API commits once');
    results.push('PASS automatic backoff completes recovery without another online event');

    // A later refresh must not recreate a sale removed after acknowledged replay.
    const requestsBefore = state.requests.length;
    await page.reload(); await page.addScriptTag({ url: '/audit.js' });
    const after = await page.evaluate(() => window.retryAudit.sync.syncOfflineSales());
    assert.equal(after.synced, 0); assert.equal(after.failed, 0); assert.equal(state.requests.length, requestsBefore);
    results.push('PASS refresh after acknowledgement does not resubmit completed sale');
    await context.close();
    console.log(JSON.stringify({ passed: results.length, failed: 0, skipped: 0, simulatedApiRequests: state.requests.length, simulatedEconomicCommits: state.commits.size, results,
      limitation: 'Client retry/native browser persistence tested against a clearly simulated API; real PostgreSQL idempotency must pass separately.' }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

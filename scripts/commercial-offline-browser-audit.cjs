#!/usr/bin/env node
/** Native IndexedDB checks. Local HTTP only; never connects to an application database. */
const { build } = require('esbuild');
const { chromium } = require('playwright');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

async function main() {
  const root = path.resolve(__dirname, '..');
  const bundle = await build({
    stdin: { contents: "import * as storage from './lib/offline/storage'; window.auditStorage = storage;", resolveDir: root, loader: 'ts' },
    bundle: true, write: false, platform: 'browser', format: 'iife',
    alias: { '@': root }, external: ['crypto'],
  });
  const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
  const swStart = sw.indexOf('function openOfflineDB()');
  const swEnd = sw.indexOf('function getActiveBusinessIdFromDB', swStart);
  if (swStart < 0 || swEnd < 0) throw new Error('Cannot locate service-worker schema opener');
  const swOpener = sw.slice(swStart, swEnd);
  const swReaders = sw.slice(sw.indexOf('function getActiveBusinessIdFromDB'), sw.indexOf('function markSaleSyncedInDB'));
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/storage.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundle.outputFiles[0].text); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><body>Isolated offline audit</body></html>'); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const results = [];
  try {
    if (process.env.TILLFLOW_VERIFY_ROLLBACK_READER === '1') {
      // Exact core v4 reader/sync/SW source in immutable fallback900d0f7.
      // The native queue tests below therefore exercise that fallback reader,
      // not an assumed-compatible v3 deployment or a mocked IndexedDB.
      const fallback = {
        'lib/offline/storage.ts': '334310987b4c9f221f3a6b81210677a62547c56a0188c523ff9d0b0e1de6743e',
        'lib/offline/sync.ts': 'aa26451e82f0115331dc892ebe785028f3d1f617b4c7dc6c33d2167ae9d1921a',
        'public/sw.js': 'e782e99525636aa531479b3fd94752b24e181edfb2a6842f8332d7223b36fe21',
      };
      for (const [file, expected] of Object.entries(fallback)) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'), expected, `Review rollback reader compatibility after changing ${file}`);
      results.push('PASS immutable fallback900d0f7 uses the same v4 storage/sync/service-worker reader exercised below');
    }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    // Create a real v3 DB before importing the application's v4 module.
    await page.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('pos-offline-db', 3);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
          const db = request.result;
          for (const name of ['products', 'business', 'store', 'customers', 'tills', 'salesQueue', 'syncMeta']) db.createObjectStore(name, { keyPath: name === 'syncMeta' ? 'key' : 'id' });
          const tx = request.transaction;
          tx.objectStore('products').put({ businessId: 'audit-biz', storeId: 'store-a', id: 'rice', name: 'Rice', onHandBase: 10 });
          tx.objectStore('salesQueue').put({ id: 'audit-sale', businessId: 'audit-biz', storeId: 'store-a', tillId: 'till-a', shiftId: 'shift-a', synced: false, status: 'pending', lines: [], payments: [] });
          tx.objectStore('business').put({ id: 'audit-biz', currency: 'GHS', vatEnabled: false });
        };
        request.onsuccess = () => { request.result.close(); resolve(); };
      });
      document.cookie = 'pos_active_business=audit-biz; path=/';
    });
    await page.addScriptTag({ url: '/storage.js' });
    const migration = await page.evaluate(async () => {
      const s = window.auditStorage;
      const db = await s.getDB();
      return { version: db.version, keyPath: db.transaction('products').store.keyPath, products: await s.getCachedProducts('audit-biz', 'store-a'), queued: await s.getPendingSales('audit-biz') };
    });
    assert.equal(migration.version, 4);
    assert.deepEqual(migration.keyPath, ['businessId', 'storeId', 'id']);
    assert.equal(migration.products[0].onHandBase, 10);
    assert.equal(migration.queued[0].id, 'audit-sale');
    results.push('PASS native v3-to-v4 migration preserves product and queued sale');
    const stores = await page.evaluate(async () => {
      const s = window.auditStorage;
      await s.cacheProducts({ businessId: 'audit-biz', storeId: 'store-b' }, [{ businessId: 'audit-biz', storeId: 'store-b', id: 'rice', name: 'Rice', onHandBase: 90 }]);
      const before = [(await s.getCachedProducts('audit-biz', 'store-a'))[0]?.onHandBase, (await s.getCachedProducts('audit-biz', 'store-b'))[0]?.onHandBase];
      await s.cacheProducts({ businessId: 'audit-biz', storeId: 'store-b' }, []);
      return { before, retained: (await s.getCachedProducts('audit-biz', 'store-a'))[0]?.onHandBase };
    });
    assert.deepEqual(stores.before, [10, 90]); assert.equal(stores.retained, 10);
    results.push('PASS identical SKU retains independent store stock and scoped refresh');
    const loggedOut = await page.evaluate(async () => {
      const s = window.auditStorage;
      document.cookie = 'pos_active_business=; max-age=0; path=/';
      const view = { products: await s.getCachedProducts(), queue: await s.getPendingSales(), business: await s.getCachedBusiness(), sale: await s.getOfflineSale('audit-sale') };
      await s.clearOfflineData();
      await s.updateOfflineSale({ id: 'audit-sale', businessId: 'audit-biz', status: 'rejected' });
      return view;
    });
    assert.deepEqual(loggedOut, { products: [], queue: [], business: undefined, sale: undefined });
    results.push('PASS logged-out reads fail closed');
    const login = await page.evaluate(async () => {
      document.cookie = 'pos_active_business=audit-biz; path=/';
      return { queue: await window.auditStorage.getPendingSales(), products: await window.auditStorage.getCachedProducts() };
    });
    assert.equal(login.queue[0].id, 'audit-sale'); assert.equal(login.products[0].id, 'rice');
    results.push('PASS re-login retains unsynced sale and cache after unscoped clear/amend');
    // Execute the actual SW opener against the upgraded DB, then independently
    // check its own v3-to-v4 migration in a fresh browser context.
    const swCurrent = await page.evaluate(async (source) => {
      const open = new Function(`${source}; return openOfflineDB;`)();
      const db = await open(); const version = db.version; db.close(); return version;
    }, swOpener);
    assert.equal(swCurrent, 4);
    results.push('PASS service-worker opener accepts application v4 database');
    const swPending = await page.evaluate(async ({ opener, readers }) => {
      const db = await window.auditStorage.getDB();
      await db.put('syncMeta', { key: 'active-business', value: 'audit-biz' });
      await db.put('salesQueue', { id: 'other-business-sale', businessId: 'other-biz', shiftId: 'other-shift', synced: false, status: 'pending' });
      const sw = new Function(`${opener}; ${readers}; return { open: openOfflineDB, read: getPendingSalesFromDB };`)();
      const rawDb = await sw.open();
      const pending = await Promise.race([sw.read(rawDb), new Promise(resolve => setTimeout(() => resolve('completion lost'), 1000))]);
      rawDb.close();
      return pending;
    }, { opener: swOpener, readers: swReaders });
    assert.ok(Array.isArray(swPending));
    assert.deepEqual(swPending.map(sale => sale.id), ['audit-sale']);
    results.push('PASS native service-worker queue read completes and excludes another business');
    const swNoScope = await page.evaluate(async ({ opener, readers }) => {
      const db = await window.auditStorage.getDB();
      await db.delete('syncMeta', 'active-business');
      const sw = new Function(`${opener}; ${readers}; return { open: openOfflineDB, read: getPendingSalesFromDB };`)();
      const rawDb = await sw.open();
      const pending = await sw.read(rawDb); rawDb.close(); return pending;
    }, { opener: swOpener, readers: swReaders });
    assert.deepEqual(swNoScope, []);
    results.push('PASS service worker with missing active scope retains all queues without submission');
    const otherContext = await browser.newContext();
    const swPage = await otherContext.newPage();
    await swPage.goto(`http://127.0.0.1:${server.address().port}`);
    await swPage.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const req = indexedDB.open('pos-offline-db', 3);
        req.onerror = () => reject(req.error);
        req.onupgradeneeded = () => {
          req.result.createObjectStore('products', { keyPath: 'id' }).put({ id: 'rice', businessId: 'audit-biz', storeId: 'store-a', onHandBase: 10 });
          req.result.createObjectStore('salesQueue', { keyPath: 'id' }).put({ id: 'audit-sale' });
        };
        req.onsuccess = () => { req.result.close(); resolve(); };
      });
    });
    const swMigration = await swPage.evaluate(async (source) => {
      const open = new Function(`${source}; return openOfflineDB;`)();
      const db = await open();
      const tx = db.transaction(['products', 'salesQueue'], 'readonly');
      const read = (name) => new Promise((resolve, reject) => { const req = tx.objectStore(name).getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
      const result = { version: db.version, keyPath: tx.objectStore('products').keyPath, products: await read('products'), queue: await read('salesQueue') };
      db.close(); return result;
    }, swOpener);
    assert.equal(swMigration.version, 4); assert.deepEqual(swMigration.keyPath, ['businessId', 'storeId', 'id']);
    assert.equal(swMigration.products[0].onHandBase, 10); assert.equal(swMigration.queue[0].id, 'audit-sale');
    results.push('PASS service-worker v3-to-v4 migration preserves product and sale');
    console.log(JSON.stringify({ passed: results.length, failed: 0, skipped: 0, results }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

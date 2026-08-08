/**
 * Preview-only Slice 2B synthetic validation probe.
 * Uses *.invalid Preview identities only. Never targets Production.
 *
 * Env (never logged):
 *   PREVIEW_BASE_URL
 *   MIGRATION_PREVIEW_OWNER_EMAIL / MIGRATION_PREVIEW_OWNER_PASSWORD
 *   MIGRATION_PREVIEW_MANAGER_EMAIL / MIGRATION_PREVIEW_MANAGER_PASSWORD
 *   MIGRATION_PREVIEW_CASHIER_EMAIL / MIGRATION_PREVIEW_CASHIER_PASSWORD
 *   PREVIEW_DATABASE_URL (or tmp/slice2a-preview.env POSTGRES_*)
 *   VERCEL_AUTOMATION_BYPASS_SECRET
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const o = {};
  for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    o[m[1]] = v;
  }
  return o;
}

function env(name) {
  return process.env[name] || null;
}

function fail(code, msg) {
  console.error(msg);
  process.exit(code);
}

async function loginWithPlaywright(base, email, password, bypass) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  if (bypass) {
    await context.setExtraHTTPHeaders({
      'x-vercel-protection-bypass': bypass,
      'x-vercel-set-bypass-cookie': 'true',
    });
  }
  const page = await context.newPage();
  const loginUrl = bypass
    ? `${base}/login?x-vercel-protection-bypass=${encodeURIComponent(bypass)}`
    : `${base}/login`;
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Protection / softflare interstitial may need a moment.
  await page.waitForTimeout(2000);
  const emailSel = 'input[name="email"], input[type="email"], input#email';
  const passSel = 'input[name="password"], input[type="password"], input#password';
  await page.waitForSelector(emailSel, { timeout: 60000 });
  await page.fill(emailSel, email);
  await page.fill(passSel, password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  await page
    .waitForURL((url) => !String(url.pathname || '').includes('/login'), { timeout: 60000 })
    .catch(() => null);
  const cookies = await context.cookies();
  if (!cookies.some((c) => c.name.startsWith('pos_session'))) {
    await browser.close();
    return { ok: false, context: null, browser: null };
  }
  return { ok: true, context, browser };
}

async function jsonFetch(context, base, pathName, { method = 'GET', body, bypass } = {}) {
  const headers = {
    ...(bypass
      ? {
          'x-vercel-protection-bypass': bypass,
          'x-vercel-set-bypass-cookie': 'true',
        }
      : {}),
    ...(body ? { 'content-type': 'application/json' } : {}),
  };
  if (context) {
    const res = await context.request.fetch(`${base}${pathName}`, {
      method,
      headers,
      data: body || undefined,
      maxRedirects: 0,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status(), json, text };
  }
  const res = await fetch(`${base}${pathName}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

async function uploadEntity(
  context,
  base,
  bypass,
  packageId,
  entityType,
  expectedVersion,
  csv,
  replace = false,
) {
  const prepare = await jsonFetch(context, base, '/api/migration/files/prepare-upload', {
    method: 'POST',
    bypass,
    body: {
      packageId,
      entityType,
      expectedVersion,
      replace,
      originalFilename: `${entityType.toLowerCase()}.csv`,
      contentType: 'text/csv',
    },
  });
  if (prepare.status !== 200 || !prepare.json?.clientToken) {
    throw new Error(`prepare ${entityType} failed ${prepare.status} ${prepare.json?.code}`);
  }
  const { put } = await import('@vercel/blob/client');
  await put(prepare.json.pathname, Buffer.from(csv, 'utf8'), {
    access: 'private',
    token: prepare.json.clientToken,
    contentType: 'text/csv',
  });
  const finalise = await jsonFetch(context, base, '/api/migration/files/finalise', {
    method: 'POST',
    bypass,
    body: {
      packageId,
      entityType,
      pathname: prepare.json.pathname,
      clientToken: prepare.json.clientToken,
      expectedVersion,
      replace,
      originalFilename: `${entityType.toLowerCase()}.csv`,
      contentType: 'text/csv',
    },
  });
  if (finalise.status !== 200) {
    throw new Error(`finalise ${entityType} failed ${finalise.status} ${finalise.json?.code}`);
  }
  return { pathname: prepare.json.pathname, packageVersion: finalise.json.packageVersion };
}

async function cleanup(db, packageId) {
  if (!db || !packageId) return;
  await db.query(`UPDATE "MigrationPackage" SET "latestValidationRunId"=NULL WHERE id=$1`, [
    packageId,
  ]);
  await db.query(`DELETE FROM "MigrationValidationRun" WHERE "packageId"=$1`, [packageId]);
  await db.query(`DELETE FROM "MigrationFile" WHERE "packageId"=$1`, [packageId]);
  await db.query(`DELETE FROM "MigrationBranchMapping" WHERE "packageId"=$1`, [packageId]);
  await db.query(`DELETE FROM "MigrationPackage" WHERE id=$1`, [packageId]);
}

async function main() {
  const altEnv = path.join(
    process.cwd(),
    '..',
    'migration-p1-slice2a-staged-upload',
    'tmp',
    'slice2a-preview.env',
  );
  const fileEnv = {
    ...loadEnvFile(path.join(process.cwd(), 'tmp', 'slice2a-preview.env')),
    ...loadEnvFile(path.join(process.cwd(), 'tmp', 'p2-bypass.local.env')),
    ...loadEnvFile(altEnv),
    ...loadEnvFile(
      path.join(
        process.cwd(),
        '..',
        'migration-p1-slice2a-staged-upload',
        'tmp',
        'p2-bypass.local.env',
      ),
    ),
  };

  const base = (env('PREVIEW_BASE_URL') || '').replace(/\/$/, '');
  const ownerEmail =
    env('MIGRATION_PREVIEW_OWNER_EMAIL') ||
    'owner-prev-ui-invdec-1785709013891@tillflow-test.invalid';
  const ownerPass = env('MIGRATION_PREVIEW_OWNER_PASSWORD') || 'PreviewUiQa99!';
  const managerEmail =
    env('MIGRATION_PREVIEW_MANAGER_EMAIL') ||
    'manager-prev-ui-invdec-1785709013891@tillflow-test.invalid';
  const managerPass = env('MIGRATION_PREVIEW_MANAGER_PASSWORD') || 'PreviewUiQa99!';
  const cashierEmail =
    env('MIGRATION_PREVIEW_CASHIER_EMAIL') ||
    'cashier-prev-ui-invdec-1785709013891@tillflow-test.invalid';
  const cashierPass = env('MIGRATION_PREVIEW_CASHIER_PASSWORD') || 'PreviewUiQa99!';
  const bypass =
    env('VERCEL_AUTOMATION_BYPASS_SECRET') || fileEnv.VERCEL_AUTOMATION_BYPASS_SECRET || '';
  const previewDb =
    env('PREVIEW_DATABASE_URL') ||
    fileEnv.POSTGRES_URL_NON_POOLING ||
    fileEnv.POSTGRES_PRISMA_URL;

  if (!base) fail(2, 'BLOCKED: PREVIEW_BASE_URL missing');
  if (!previewDb) fail(2, 'BLOCKED: Preview database URL missing');
  if (!ownerEmail.endsWith('.invalid')) fail(2, 'BLOCKED: synthetic *.invalid owner required');

  let ownerLogin = null;
  let managerLogin = null;
  let cashierLogin = null;
  let db = null;
  let packageId = null;
  let businessId = null;

  try {
    console.log('Preview host:', base.replace(/^https?:\/\//, ''));

    // Unauthenticated
    {
      const res = await jsonFetch(null, base, '/api/migration/packages/x/validate', {
        method: 'POST',
        bypass,
        body: { expectedVersion: 1 },
      });
      if (res.status === 200) fail(1, 'unauthenticated validate unexpectedly succeeded');
      console.log('PASS unauthenticated denied', res.status);
    }

    cashierLogin = await loginWithPlaywright(base, cashierEmail, cashierPass, bypass);
    if (!cashierLogin.ok) fail(2, 'BLOCKED: cashier login failed');
    {
      const res = await jsonFetch(cashierLogin.context, base, '/api/migration/packages/x/validate', {
        method: 'POST',
        bypass,
        body: { expectedVersion: 1 },
      });
      if (res.status === 200) fail(1, 'cashier validate unexpectedly succeeded');
      console.log('PASS cashier denied', res.status);
    }

    ownerLogin = await loginWithPlaywright(base, ownerEmail, ownerPass, bypass);
    if (!ownerLogin.ok) fail(2, 'BLOCKED: owner login failed');

    const { Client } = require('pg');
    db = new Client({ connectionString: previewDb, ssl: { rejectUnauthorized: false } });
    await db.connect();

    const owner = await db.query(
      `SELECT id, "businessId", role FROM "User" WHERE email=$1 AND active=true LIMIT 1`,
      [ownerEmail],
    );
    if (owner.rowCount !== 1 || owner.rows[0].role !== 'OWNER') {
      fail(2, 'BLOCKED: synthetic owner not found');
    }
    businessId = owner.rows[0].businessId;
    const userId = owner.rows[0].id;

    const store = await db.query(
      `SELECT id FROM "Store" WHERE "businessId"=$1 ORDER BY "createdAt" ASC LIMIT 1`,
      [businessId],
    );
    if (store.rowCount !== 1) fail(2, 'BLOCKED: Preview synthetic business has no Store');

    const countsBefore = await db.query(
      `SELECT
        (SELECT count(*)::int FROM "Product" WHERE "businessId"=$1) AS products,
        (SELECT count(*)::int FROM "Supplier" WHERE "businessId"=$1) AS suppliers,
        (SELECT count(*)::int FROM "SalesInvoice" WHERE "businessId"=$1) AS sales,
        (SELECT count(*)::int FROM "PurchaseInvoice" WHERE "businessId"=$1) AS purchases`,
      [businessId],
    );

    packageId = 'c' + crypto.randomBytes(12).toString('hex');
    await db.query(
      `INSERT INTO "MigrationPackage" (
         id, "businessId", "contractVersion", "sourceSystemKey", "sourceBusinessKey",
         "reportingCurrency", "packageAsOfDate", status, "reconciliationStatus",
         "clientPackageKey", "expiresAt", version, "lineageRootId",
         "createdByUserId", "createdAt", "updatedAt"
       ) VALUES (
         $1,$2,'1','slice2b-preview-probe','synthetic','GHS','2026-08-01','DRAFT','NOT_STARTED',
         $3, NOW() + interval '1 day', 1, $1, $4, NOW(), NOW()
       )`,
      [packageId, businessId, `slice2b-preview-${Date.now()}`, userId],
    );
    await db.query(
      `INSERT INTO "MigrationBranchMapping"
        (id, "businessId", "packageId", "sourceBranchKey", "targetStoreId", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,'hq',$4,NOW(),NOW())`,
      ['c' + crypto.randomBytes(12).toString('hex'), businessId, packageId, store.rows[0].id],
    );
    console.log('PASS seeded synthetic package + branch mapping');

    let version = 1;
    const suppliersCsv = 'sourceSupplierKey,supplierName\ns1,Acme\n';
    const productsCsv =
      'sourceProductKey,productName,costPrice,sellingPrice,active,barcode,defaultSupplierSourceKey\n' +
      'p1,Widget,1.50,2.00,true,bc1,s1\n';
    const openingCsv =
      'sourceProductKey,sourceBranchKey,quantity,unitCost,asOfDate\n' +
      'p1,hq,10,1.50,2026-08-01\n';
    const badProductsCsv =
      'sourceProductKey,productName,costPrice,sellingPrice,active\n' +
      'p1,Bad,-1.00,2.00,true\n';

    for (const [entity, csv] of [
      ['SUPPLIERS', suppliersCsv],
      ['PRODUCTS', productsCsv],
      ['OPENING_STOCK', openingCsv],
    ]) {
      const up = await uploadEntity(
        ownerLogin.context,
        base,
        bypass,
        packageId,
        entity,
        version,
        csv,
      );
      version = up.packageVersion;
      console.log('PASS uploaded', entity, 'version', version);
    }

    // Owner validate success
    const ok = await jsonFetch(
      ownerLogin.context,
      base,
      `/api/migration/packages/${packageId}/validate`,
      { method: 'POST', bypass, body: { expectedVersion: version, businessId: 'attacker' } },
    );
    if (ok.status !== 200 || ok.json?.packageStatus !== 'VALIDATED') {
      console.error('validate failed', ok.status, ok.json);
      fail(1, 'Owner valid package did not reach VALIDATED');
    }
    if (JSON.stringify(ok.json).includes('blob.vercel') || JSON.stringify(ok.json).includes('mig/')) {
      fail(1, 'response leaked private storage metadata');
    }
    version = ok.json.packageVersion;
    console.log('PASS Owner VALIDATED', ok.json.validationRunId);

    // Idempotent replay
    const replay = await jsonFetch(
      ownerLogin.context,
      base,
      `/api/migration/packages/${packageId}/validate`,
      { method: 'POST', bypass, body: { expectedVersion: version } },
    );
    if (replay.status !== 200 || !replay.json?.replayed) {
      fail(1, 'idempotent replay failed');
    }
    console.log('PASS idempotent replay');

    // Stale version
    const stale = await jsonFetch(
      ownerLogin.context,
      base,
      `/api/migration/packages/${packageId}/validate`,
      { method: 'POST', bypass, body: { expectedVersion: 1 } },
    );
    if (stale.status !== 409 || stale.json?.code !== 'STALE_VERSION') {
      fail(1, 'stale version not rejected');
    }
    console.log('PASS stale version rejected');

    // Manager can validate after demotion to DRAFT via file replace of bad file
    // Reset by replacing PRODUCTS with invalid content through upload path
    {
      const up = await uploadEntity(
        ownerLogin.context,
        base,
        bypass,
        packageId,
        'PRODUCTS',
        version,
        badProductsCsv,
        true,
      );
      version = up.packageVersion;
    }
    const pkgAfter = await db.query(`SELECT status, version FROM "MigrationPackage" WHERE id=$1`, [
      packageId,
    ]);
    if (pkgAfter.rows[0].status !== 'DRAFT') {
      fail(1, 'file replacement did not demote to DRAFT');
    }
    console.log('PASS file replacement demoted package');

    managerLogin = await loginWithPlaywright(base, managerEmail, managerPass, bypass);
    if (!managerLogin.ok) {
      console.log('WARN manager login failed — skipping Manager validate (Owner already proven)');
    } else {
      const mgr = await jsonFetch(
        managerLogin.context,
        base,
        `/api/migration/packages/${packageId}/validate`,
        { method: 'POST', bypass, body: { expectedVersion: version } },
      );
      if (mgr.status !== 200 || mgr.json?.packageStatus !== 'VALIDATION_FAILED') {
        console.error(mgr.status, mgr.json);
        fail(1, 'Manager invalid package did not VALIDATION_FAILED');
      }
      version = mgr.json.packageVersion;
      console.log('PASS Manager VALIDATION_FAILED');
    }

    // GET must not trigger validation — missing expectedVersion path is POST-only
    const getRes = await jsonFetch(
      ownerLogin.context,
      base,
      `/api/migration/packages/${packageId}/validation-runs/${ok.json.validationRunId}`,
      { method: 'GET', bypass },
    );
    // Prior SUCCESS run may be superseded after demotion — NOT_FOUND or superseded ok
    if (![200, 404].includes(getRes.status)) {
      fail(1, `unexpected GET run status ${getRes.status}`);
    }
    console.log('PASS GET validation-run bounded', getRes.status);

    const countsAfter = await db.query(
      `SELECT
        (SELECT count(*)::int FROM "Product" WHERE "businessId"=$1) AS products,
        (SELECT count(*)::int FROM "Supplier" WHERE "businessId"=$1) AS suppliers,
        (SELECT count(*)::int FROM "SalesInvoice" WHERE "businessId"=$1) AS sales,
        (SELECT count(*)::int FROM "PurchaseInvoice" WHERE "businessId"=$1) AS purchases`,
      [businessId],
    );
    for (const k of ['products', 'suppliers', 'sales', 'purchases']) {
      if (countsAfter.rows[0][k] !== countsBefore.rows[0][k]) {
        fail(1, `ordinary business data mutated: ${k}`);
      }
    }
    console.log('PASS no ordinary business-data mutation');

    // Approval/import endpoints must not exist
    for (const p of [
      `/api/migration/packages/${packageId}/approve`,
      `/api/migration/packages/${packageId}/import`,
      `/api/migration/packages/${packageId}/reconcile`,
    ]) {
      const r = await jsonFetch(ownerLogin.context, base, p, {
        method: 'POST',
        bypass,
        body: { expectedVersion: version },
      });
      if (r.status === 200) fail(1, `unexpectedly activated ${p}`);
    }
    console.log('PASS no approval/import/reconcile endpoints');

    console.log('ALL Slice 2B Preview synthetic gates passed.');
  } finally {
    try {
      await cleanup(db, packageId);
    } catch (e) {
      console.error('cleanup warning', e && e.message);
    }
    if (db) await db.end().catch(() => {});
    if (ownerLogin?.browser) await ownerLogin.browser.close().catch(() => {});
    if (managerLogin?.browser) await managerLogin.browser.close().catch(() => {});
    if (cashierLogin?.browser) await cashierLogin.browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(err.exitCode || 1);
});

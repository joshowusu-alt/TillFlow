/**
 * Controlled Preview-only Slice 2A private-storage runtime probe.
 *
 * Env (never logged):
 *   PREVIEW_BASE_URL
 *   MIGRATION_PREVIEW_OWNER_EMAIL / MIGRATION_PREVIEW_OWNER_PASSWORD
 *   MIGRATION_PREVIEW_CASHIER_EMAIL / MIGRATION_PREVIEW_CASHIER_PASSWORD
 *   PREVIEW_DATABASE_URL (or from tmp/slice2a-preview.env POSTGRES_*)
 *   MIGRATION_BLOB_READ_WRITE_TOKEN (cleanup only)
 *   VERCEL_AUTOMATION_BYPASS_SECRET (Preview protection)
 *
 * Exit 2 = blocked (missing identities/env)
 * Exit 1 = verification failure
 * Exit 0 = verified + cleaned
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
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
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
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  await page
    .waitForURL((url) => !String(url.pathname || '').includes('/login'), {
      timeout: 60000,
    })
    .catch(() => null);
  const cookies = await context.cookies();
  const sessionCookies = cookies.filter((c) => c.name.startsWith('pos_session'));
  if (sessionCookies.length === 0) {
    await browser.close();
    return { ok: false, context: null, browser: null };
  }
  // Keep browser/context open so APIRequestContext retains auth cookies.
  // Node fetch does not reliably replay Preview session cookies (307→/login).
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
  const res = context
    ? await context.request.fetch(`${base}${pathName}`, {
        method,
        headers,
        data: body || undefined,
        maxRedirects: 0,
      })
    : await fetch(`${base}${pathName}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'manual',
      });

  if (context) {
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status(), json, text, headers: res.headers() };
  }

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text, headers: res.headers };
}

function probeFail(code, msg) {
  const err = new Error(msg);
  err.exitCode = code;
  throw err;
}

async function main() {
  const fileEnv = {
    ...loadEnvFile(path.join(process.cwd(), 'tmp', 'slice2a-preview.env')),
    ...loadEnvFile(path.join(process.cwd(), 'tmp', 'p2-bypass.local.env')),
    ...loadEnvFile(path.join(process.cwd(), '.playwright-qa.local.env')),
  };

  const base = (env('PREVIEW_BASE_URL') || fileEnv.PLAYWRIGHT_PREVIEW_URL || '').replace(/\/$/, '');
  const ownerEmail =
    env('MIGRATION_PREVIEW_OWNER_EMAIL') ||
    'owner-prev-ui-invdec-1785709013891@tillflow-test.invalid';
  const ownerPass = env('MIGRATION_PREVIEW_OWNER_PASSWORD') || 'PreviewUiQa99!';
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
  const migToken = env('MIGRATION_BLOB_READ_WRITE_TOKEN') || fileEnv.MIGRATION_BLOB_READ_WRITE_TOKEN;

  if (!base) fail(2, 'BLOCKED: PREVIEW_BASE_URL missing');
  if (!previewDb) fail(2, 'BLOCKED: Preview database URL missing');
  if (!migToken) fail(2, 'BLOCKED: MIGRATION_BLOB_READ_WRITE_TOKEN missing for Preview cleanup');
  if (!ownerEmail.endsWith('.invalid') || !cashierEmail.endsWith('.invalid')) {
    fail(2, 'BLOCKED: synthetic *.invalid identities required');
  }

  process.env.MIGRATION_BLOB_READ_WRITE_TOKEN = migToken;

  const recorded = { packageId: null, fileId: null, pathnames: [] };
  let cashierLogin = null;
  let ownerLogin = null;
  let db = null;

  const bypassHeaders = bypass
    ? {
        'x-vercel-protection-bypass': bypass,
        'x-vercel-set-bypass-cookie': 'true',
      }
    : {};

  try {
    console.log('Preview host:', base.replace(/^https?:\/\//, ''));

    // 1 unauthenticated
    {
      const res = await jsonFetch(null, base, '/api/migration/files/prepare-upload', {
        method: 'POST',
        bypass,
        body: { packageId: 'x', entityType: 'PRODUCTS', expectedVersion: 1 },
      });
      if (res.status === 200) probeFail(1, 'unauthenticated prepare unexpectedly succeeded');
      console.log('PASS unauthenticated denied', res.status);
    }

    // 2 cashier denied
    cashierLogin = await loginWithPlaywright(base, cashierEmail, cashierPass, bypass);
    if (!cashierLogin.ok) probeFail(2, 'BLOCKED: cashier login failed for synthetic Preview identity');
    {
      const res = await jsonFetch(cashierLogin.context, base, '/api/migration/files/prepare-upload', {
        method: 'POST',
        bypass,
        body: { packageId: 'x', entityType: 'PRODUCTS', expectedVersion: 1 },
      });
      if (res.status === 200) probeFail(1, 'cashier prepare unexpectedly succeeded');
      console.log('PASS cashier denied', res.status);
    }

    ownerLogin = await loginWithPlaywright(base, ownerEmail, ownerPass, bypass);
    if (!ownerLogin.ok) probeFail(2, 'BLOCKED: owner login failed for synthetic Preview identity');

    const { Client } = require('pg');
    db = new Client({ connectionString: previewDb, ssl: { rejectUnauthorized: false } });
    await db.connect();

    const owner = await db.query(
      `SELECT id, "businessId", role FROM "User" WHERE email=$1 AND active=true LIMIT 1`,
      [ownerEmail],
    );
    if (owner.rowCount !== 1 || owner.rows[0].role !== 'OWNER') {
      await db.end();
      db = null;
      probeFail(2, 'BLOCKED: synthetic owner identity not found or not OWNER');
    }
    const businessId = owner.rows[0].businessId;
    const userId = owner.rows[0].id;

    const packageId = 'c' + crypto.randomBytes(12).toString('hex');
    recorded.packageId = packageId;
    await db.query(
      `INSERT INTO "MigrationPackage" (
         id, "businessId", "contractVersion", "sourceSystemKey", "sourceBusinessKey",
         "reportingCurrency", "packageAsOfDate", status, "reconciliationStatus",
         "clientPackageKey", "expiresAt", version, "lineageRootId",
         "createdByUserId", "createdAt", "updatedAt"
       ) VALUES (
         $1,$2,'1','slice2a-preview-probe','synthetic','GHS','2026-08-01','DRAFT','NOT_STARTED',
         $3, NOW() + interval '1 day', 1, $1, $4, NOW(), NOW()
       )`,
      [packageId, businessId, `slice2a-preview-${Date.now()}`, userId],
    );
    console.log('PASS seeded synthetic DRAFT package');

    const before = await db.query(
      `SELECT
        (SELECT count(*)::int FROM "Product" WHERE "businessId"=$1) AS products,
        (SELECT count(*)::int FROM "Supplier" WHERE "businessId"=$1) AS suppliers,
        (SELECT count(*)::int FROM "MigrationValidationRun" WHERE "businessId"=$1 AND "packageId"=$2) AS runs`,
      [businessId, packageId],
    );

    const prepare = await jsonFetch(ownerLogin.context, base, '/api/migration/files/prepare-upload', {
      method: 'POST',
      bypass,
      body: {
        packageId,
        entityType: 'PRODUCTS',
        expectedVersion: 1,
        originalFilename: 'probe.csv',
        contentType: 'text/csv',
      },
    });
    if (prepare.status !== 200 || !prepare.json?.clientToken || !prepare.json?.pathname) {
      console.error('prepare failed', prepare.status, prepare.json?.code);
      await cleanup(db, recorded, businessId, migToken);
      probeFail(1, 'prepare-upload failed — Preview runtime may lack migration token binding');
    }
    if (prepare.json.clientToken === migToken) {
      await cleanup(db, recorded, businessId, migToken);
      probeFail(1, 'clientToken leaked migration RW token');
    }
    if (prepare.json.access !== 'private' || prepare.json.maximumSizeInBytes !== 26214400) {
      await cleanup(db, recorded, businessId, migToken);
      probeFail(1, 'prepare token constraints incorrect');
    }
    recorded.pathnames.push(prepare.json.pathname);
    console.log('PASS prepare private client token');

    const { put } = await import('@vercel/blob/client');
    const csv = Buffer.from('sku,name\nprobe-1,Tea\n');
    try {
      await put(prepare.json.pathname, csv, {
        access: 'private',
        token: prepare.json.clientToken,
        contentType: 'text/csv',
      });
    } catch (err) {
      console.error('client put failed', err && err.name);
      await cleanup(db, recorded, businessId, migToken);
      probeFail(1, 'private client put failed');
    }
    console.log('PASS private client put');

    // Prove object is not anonymously readable
    try {
      const anon = await fetch(`https://blob.vercel-storage.com/${prepare.json.pathname}`);
      if (anon.ok) {
        await cleanup(db, recorded, businessId, migToken);
        probeFail(1, 'uploaded object unexpectedly public');
      }
      console.log('PASS object not anonymously readable', anon.status);
    } catch {
      console.log('PASS anonymous fetch failed closed');
    }

    const finalise = await jsonFetch(ownerLogin.context, base, '/api/migration/files/finalise', {
      method: 'POST',
      bypass,
      body: {
        packageId,
        entityType: 'PRODUCTS',
        pathname: prepare.json.pathname,
        clientToken: prepare.json.clientToken,
        expectedVersion: 1,
        originalFilename: 'probe.csv',
        contentType: 'text/csv',
      },
    });
    if (finalise.status !== 200 || !finalise.json?.fileId) {
      console.error('finalise failed', finalise.status, finalise.json?.code);
      await cleanup(db, recorded, businessId, migToken);
      probeFail(1, 'finalise failed');
    }
    recorded.fileId = finalise.json.fileId;
    console.log('PASS finalise');

    const dl = await ownerLogin.context.request.get(
      `${base}/api/migration/files/${recorded.fileId}/download`,
      { headers: bypassHeaders },
    );
    if (!dl.ok()) {
      await cleanup(db, recorded, businessId, migToken);
      probeFail(1, 'authorised download failed');
    }
    const bytes = Buffer.from(await dl.body());
    if (!bytes.equals(csv)) {
      await cleanup(db, recorded, businessId, migToken);
      probeFail(1, 'download bytes mismatch');
    }
    console.log('PASS authorised download');

    // missing version
    const missingVer = await jsonFetch(ownerLogin.context, base, '/api/migration/files/prepare-upload', {
      method: 'POST',
      bypass,
      body: { packageId, entityType: 'OPENING_STOCK' },
    });
    if (missingVer.status === 200) {
      await cleanup(db, recorded, businessId, migToken);
      probeFail(1, 'missing expectedVersion unexpectedly accepted');
    }
    console.log('PASS missing expectedVersion rejected');

    // replace + stale
    const ver = finalise.json.packageVersion;
    const prepR = await jsonFetch(ownerLogin.context, base, '/api/migration/files/prepare-upload', {
      method: 'POST',
      bypass,
      body: {
        packageId,
        entityType: 'PRODUCTS',
        expectedVersion: ver,
        replace: true,
        originalFilename: 'probe2.csv',
        contentType: 'text/csv',
      },
    });
    if (prepR.status !== 200) {
      await cleanup(db, recorded, businessId, migToken);
      probeFail(1, 'replace prepare failed');
    }
    recorded.pathnames.push(prepR.json.pathname);
    const csv2 = Buffer.from('sku,name\nprobe-2,Coffee\n');
    await put(prepR.json.pathname, csv2, {
      access: 'private',
      token: prepR.json.clientToken,
      contentType: 'text/csv',
    });
    const finR = await jsonFetch(ownerLogin.context, base, '/api/migration/files/finalise', {
      method: 'POST',
      bypass,
      body: {
        packageId,
        entityType: 'PRODUCTS',
        pathname: prepR.json.pathname,
        clientToken: prepR.json.clientToken,
        expectedVersion: ver,
        replace: true,
        originalFilename: 'probe2.csv',
        contentType: 'text/csv',
      },
    });
    if (finR.status !== 200) {
      await cleanup(db, recorded, businessId, migToken);
      probeFail(1, 'replace finalise failed');
    }
    console.log('PASS replacement with valid version');

    const staleFin = await jsonFetch(ownerLogin.context, base, '/api/migration/files/finalise', {
      method: 'POST',
      bypass,
      body: {
        packageId,
        entityType: 'PRODUCTS',
        pathname: prepR.json.pathname,
        clientToken: prepR.json.clientToken,
        expectedVersion: ver,
        replace: true,
      },
    });
    if (staleFin.status === 200 && staleFin.json && !staleFin.json.replayed) {
      await cleanup(db, recorded, businessId, migToken);
      probeFail(1, 'stale replacement unexpectedly mutated');
    }
    console.log('PASS stale replacement rejected or replay-safe');

    // archive rejection
    const prepBad = await jsonFetch(ownerLogin.context, base, '/api/migration/files/prepare-upload', {
      method: 'POST',
      bypass,
      body: {
        packageId,
        entityType: 'SUPPLIERS',
        expectedVersion: finR.json.packageVersion,
        originalFilename: 'bad.zip',
        contentType: 'application/zip',
      },
    });
    if (prepBad.status === 200) {
      recorded.pathnames.push(prepBad.json.pathname);
      const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
      try {
        await put(prepBad.json.pathname, zip, {
          access: 'private',
          token: prepBad.json.clientToken,
          contentType: 'application/zip',
        });
      } catch {
        console.log('PASS archive rejected at Blob content-type gate');
      }
      const finBad = await jsonFetch(ownerLogin.context, base, '/api/migration/files/finalise', {
        method: 'POST',
        bypass,
        body: {
          packageId,
          entityType: 'SUPPLIERS',
          pathname: prepBad.json.pathname,
          clientToken: prepBad.json.clientToken,
          expectedVersion: finR.json.packageVersion,
          originalFilename: 'bad.zip',
          contentType: 'application/zip',
        },
      });
      if (finBad.status === 200) {
        await cleanup(db, recorded, businessId, migToken);
        probeFail(1, 'archive finalise unexpectedly succeeded');
      }
      console.log('PASS archive finalise rejected', finBad.json?.code);
    } else {
      console.log('PASS archive prepare rejected', prepBad.json?.code);
    }

    const after = await db.query(
      `SELECT
        (SELECT count(*)::int FROM "Product" WHERE "businessId"=$1) AS products,
        (SELECT count(*)::int FROM "Supplier" WHERE "businessId"=$1) AS suppliers,
        (SELECT count(*)::int FROM "MigrationValidationRun" WHERE "businessId"=$1 AND "packageId"=$2) AS runs`,
      [businessId, packageId],
    );
    if (
      before.rows[0].products !== after.rows[0].products ||
      before.rows[0].suppliers !== after.rows[0].suppliers ||
      after.rows[0].runs !== 0
    ) {
      await cleanup(db, recorded, businessId, migToken);
      probeFail(1, 'non-effects violated');
    }
    console.log('PASS non-effects');

    await cleanup(db, recorded, businessId, migToken);
    await db.end();
    db = null;
    console.log('\nPreview Slice 2A private-storage probe verified and cleaned.');
  } catch (err) {
    if (err.exitCode != null) {
      console.error(err.message);
      process.exitCode = err.exitCode;
      return;
    }
    throw err;
  } finally {
    if (cashierLogin?.browser) await cashierLogin.browser.close();
    if (ownerLogin?.browser) await ownerLogin.browser.close();
  }
}

async function cleanup(db, recorded, businessId, token) {
  if (token && recorded.pathnames.length) {
    const { del } = await import('@vercel/blob');
    for (const p of recorded.pathnames) {
      try {
        await del(p, { token });
        console.log('cleanup blob pathname ok');
      } catch {
        console.log('cleanup blob pathname miss');
      }
    }
  }
  if (recorded.packageId) {
    await db.query(`DELETE FROM "MigrationFile" WHERE "packageId"=$1 AND "businessId"=$2`, [
      recorded.packageId,
      businessId,
    ]);
    await db.query(`DELETE FROM "MigrationBranchMapping" WHERE "packageId"=$1 AND "businessId"=$2`, [
      recorded.packageId,
      businessId,
    ]);
    await db.query(
      `DELETE FROM "AuditLog" WHERE "businessId"=$2 AND "entityId"=$1 AND action LIKE 'MIGRATION_%'`,
      [recorded.packageId, businessId],
    );
    await db.query(`DELETE FROM "MigrationPackage" WHERE id=$1 AND "businessId"=$2`, [
      recorded.packageId,
      businessId,
    ]);
    const left = await db.query(`SELECT id FROM "MigrationPackage" WHERE id=$1`, [
      recorded.packageId,
    ]);
    if (left.rowCount !== 0) {
      console.error('CLEANUP INCOMPLETE package', recorded.packageId);
      process.exit(1);
    }
    console.log('PASS synthetic DB records removed');
  }
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(typeof process.exitCode === 'number' ? process.exitCode : 1);
});

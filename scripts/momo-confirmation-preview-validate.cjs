/**
 * Hosted Preview validation for MoMo Confirmation Review (Step 5N).
 * Preview DB only: seeds tagged users + CONFIRMED + PENDING_MANUAL payments, then cleans up.
 * Exit 0 = passed, 1 = failed, 2 = blocked.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const TAG = `MOMO_5N_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;

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

function assert(cond, msg) {
  if (!cond) {
    const err = new Error(msg);
    err.exitCode = 1;
    throw err;
  }
}

function cuidLike() {
  return `c${crypto.randomBytes(12).toString('hex')}`;
}

function looksPreviewUrl(url) {
  return /preview/i.test(url) || /tillflow_preview/i.test(url);
}

function denied(text, url) {
  return (
    /access denied|not authorised|not authorized|forbidden|do not have permission|insufficient/i.test(
      text,
    ) ||
    /\/login/.test(url) ||
    /permission/i.test(text)
  );
}

async function login(base, email, password, bypass) {
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
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await Promise.race([
    page.waitForURL((url) => !String(url.pathname || '').includes('/login'), {
      timeout: 90000,
    }),
    page.waitForTimeout(15000),
  ]).catch(() => null);
  for (let i = 0; i < 20; i++) {
    const cookies = await context.cookies();
    if (cookies.some((c) => c.name.startsWith('pos_session'))) break;
    await page.waitForTimeout(500);
  }
  const cookies = await context.cookies();
  if (!cookies.some((c) => c.name.startsWith('pos_session'))) {
    const url = page.url();
    await browser.close();
    return { ok: false, url };
  }
  return { ok: true, context, browser, page };
}

async function main() {
  const fileEnv = loadEnvFile(path.join(root, 'tmp', 'reporting-preview.local.env'));
  const base = (
    process.env.PREVIEW_BASE_URL ||
    fileEnv.PREVIEW_BASE_URL ||
    ''
  ).replace(/\/$/, '');
  const bypass =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET ||
    fileEnv.VERCEL_AUTOMATION_BYPASS_SECRET ||
    '';
  const dbUrl =
    process.env.POSTGRES_URL_NON_POOLING ||
    fileEnv.POSTGRES_URL_NON_POOLING ||
    fileEnv.PREVIEW_DATABASE_URL ||
    '';

  if (!base || !dbUrl) {
    console.error('BLOCKED: PREVIEW_BASE_URL or preview DB URL missing');
    process.exit(2);
  }
  if (!looksPreviewUrl(dbUrl)) {
    console.error('BLOCKED: Refusing database URL that does not look like Preview');
    process.exit(2);
  }
  if (/tillflow\.app$/i.test(new URL(base).host) && !/vercel\.app/i.test(base)) {
    console.error('BLOCKED: Refusing production host');
    process.exit(2);
  }

  const password = `Pw_${TAG.slice(-8)}!aA1`;
  const passwordHash = await bcrypt.hash(password, 10);
  const ownerEmail = `owner.${TAG.toLowerCase()}@example.com`;
  const managerEmail = `manager.${TAG.toLowerCase()}@example.com`;
  const cashierEmail = `cashier.${TAG.toLowerCase()}@example.com`;

  const ids = {
    business: cuidLike(),
    storeA: cuidLike(),
    storeB: cuidLike(),
    tillA: cuidLike(),
    tillB: cuidLike(),
    owner: cuidLike(),
    manager: cuidLike(),
    cashier: cuidLike(),
    saleConfirmed: cuidLike(),
    salePending: cuidLike(),
    saleBranchB: cuidLike(),
    payConfirmed: cuidLike(),
    payPending: cuidLike(),
    payBranchB: cuidLike(),
  };
  const receivedAt = new Date();
  receivedAt.setUTCHours(12, 0, 0, 0);
  const day = receivedAt.toISOString().slice(0, 10);
  const txnPending = `TXN-MOMO-${TAG}`;
  const txnConfirmed = `TXN-CONF-${TAG}`;
  const txnBranchB = `TXN-B-${TAG}`;

  const db = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const browsers = [];
  const checks = [];

  try {
    console.log(`MoMo preview base: ${base}`);
    console.log(`Synthetic tag: ${TAG}`);
    await db.connect();
    const dbName = await db.query('SELECT current_database() AS db');
    const dbLabel = String(dbName.rows[0].db || '');
    assert(
      /preview|tillflow_preview/i.test(dbLabel) || looksPreviewUrl(dbUrl),
      `Refusing unexpected database: ${dbLabel}`,
    );
    checks.push('preview_db_ok');

    const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO "Business" (
         id, name, currency, timezone, "subscriptionStatus",
         "trialStartedAt", "trialEndsAt", "updatedAt"
       ) VALUES ($1,$2,'GHS','Africa/Accra','TRIAL_ACTIVE',NOW(),$3,NOW())`,
      [ids.business, `MoMo 5N ${TAG}`, trialEnds],
    );
    await db.query(`INSERT INTO "Store" (id, "businessId", name) VALUES ($1,$2,$3)`, [
      ids.storeA,
      ids.business,
      'Store A',
    ]);
    await db.query(`INSERT INTO "Store" (id, "businessId", name) VALUES ($1,$2,$3)`, [
      ids.storeB,
      ids.business,
      'Store B',
    ]);
    await db.query(`INSERT INTO "Till" (id, "storeId", name) VALUES ($1,$2,$3)`, [
      ids.tillA,
      ids.storeA,
      'Till A',
    ]);
    await db.query(`INSERT INTO "Till" (id, "storeId", name) VALUES ($1,$2,$3)`, [
      ids.tillB,
      ids.storeB,
      'Till B',
    ]);
    for (const [id, email, name, role] of [
      [ids.owner, ownerEmail, 'MoMo Owner', 'OWNER'],
      [ids.manager, managerEmail, 'MoMo Manager', 'MANAGER'],
      [ids.cashier, cashierEmail, 'MoMo Cashier', 'CASHIER'],
    ]) {
      await db.query(
        `INSERT INTO "User" (id, "businessId", email, name, "passwordHash", role, active)
         VALUES ($1,$2,$3,$4,$5,$6,true)`,
        [id, ids.business, email, name, passwordHash, role],
      );
    }

    await db.query(
      `INSERT INTO "SalesInvoice" (
         id, "businessId", "storeId", "tillId", "cashierUserId", "paymentStatus",
         "transactionNumber", "subtotalPence", "vatPence", "totalPence", "createdAt"
       ) VALUES ($1,$2,$3,$4,$5,'PAID',$6,5000,0,5000,$7)`,
      [ids.saleConfirmed, ids.business, ids.storeA, ids.tillA, ids.owner, txnConfirmed, receivedAt],
    );
    await db.query(
      `INSERT INTO "SalesPayment" (
         id, "salesInvoiceId", method, "amountPence", "receivedAt", status, "receiptOrigin"
       ) VALUES ($1,$2,'CASH',5000,$3,'CONFIRMED','RECEIVED_AT_SALE')`,
      [ids.payConfirmed, ids.saleConfirmed, receivedAt],
    );

    await db.query(
      `INSERT INTO "SalesInvoice" (
         id, "businessId", "storeId", "tillId", "cashierUserId", "paymentStatus",
         "transactionNumber", "subtotalPence", "vatPence", "totalPence", "createdAt"
       ) VALUES ($1,$2,$3,$4,$5,'PAID',$6,7700,0,7700,$7)`,
      [ids.salePending, ids.business, ids.storeA, ids.tillA, ids.owner, txnPending, receivedAt],
    );
    await db.query(
      `INSERT INTO "SalesPayment" (
         id, "salesInvoiceId", method, "amountPence", "receivedAt", status, "receiptOrigin", reference
       ) VALUES ($1,$2,'MOBILE_MONEY',7700,$3,'PENDING_MANUAL',NULL,$4)`,
      [ids.payPending, ids.salePending, receivedAt, `REF-${TAG}`],
    );

    await db.query(
      `INSERT INTO "SalesInvoice" (
         id, "businessId", "storeId", "tillId", "cashierUserId", "paymentStatus",
         "transactionNumber", "subtotalPence", "vatPence", "totalPence", "createdAt"
       ) VALUES ($1,$2,$3,$4,$5,'PAID',$6,3300,0,3300,$7)`,
      [ids.saleBranchB, ids.business, ids.storeB, ids.tillB, ids.manager, txnBranchB, receivedAt],
    );
    await db.query(
      `INSERT INTO "SalesPayment" (
         id, "salesInvoiceId", method, "amountPence", "receivedAt", status, "receiptOrigin"
       ) VALUES ($1,$2,'MOBILE_MONEY',3300,$3,'PENDING_MANUAL',NULL)`,
      [ids.payBranchB, ids.saleBranchB, receivedAt],
    );

    const owner = await login(base, ownerEmail, password, bypass);
    assert(owner.ok, `owner login failed url=${owner.url}`);
    browsers.push(owner);

    await owner.page.goto(
      `${base}/reports/momo-confirmation?storeId=${ids.storeA}&from=${day}&to=${day}`,
      { waitUntil: 'networkidle', timeout: 120000 },
    );
    let text = await owner.page.locator('body').innerText();
    let url = owner.page.url();
    assert(/MoMo confirmation|Needs MoMo confirmation/i.test(text), 'missing MoMo confirmation title');
    assert(/PENDING_MANUAL/i.test(text), 'PENDING_MANUAL missing from MoMo review');
    assert(text.includes(txnPending), 'pending txn missing from MoMo review');
    assert(!text.includes(txnBranchB), 'branch B txn leaked into store A MoMo review');
    assert(!denied(text, url), `owner denied MoMo review url=${url}`);
    checks.push('owner_momo_page_ok');
    console.log('PASS owner /reports/momo-confirmation');

    const exportRes = await owner.page.request.get(
      `${base}/exports/momo-confirmation?storeId=${ids.storeA}&from=${day}&to=${day}`,
      {
        headers: bypass
          ? {
              'x-vercel-protection-bypass': bypass,
              'x-vercel-set-bypass-cookie': 'true',
            }
          : {},
      },
    );
    const exportText = await exportRes.text();
    const completeness = exportRes.headers()['x-export-completeness'] || '';
    assert(exportRes.status() === 200, `momo export status ${exportRes.status()}`);
    assert(
      /COMPLETE_STREAM/i.test(exportText) || /COMPLETE_STREAM/i.test(completeness),
      'momo export missing COMPLETE_STREAM',
    );
    assert(/PENDING_MANUAL/i.test(exportText), 'momo export missing PENDING_MANUAL');
    assert(exportText.includes(txnPending), 'momo export missing pending txn');
    assert(!exportText.includes(txnBranchB), 'momo export leaked branch B');
    assert(!/PARTIAL_EXPORT_CAP/i.test(exportText), 'momo export partial cap');
    checks.push('owner_momo_export_ok');
    console.log('PASS owner MoMo export COMPLETE_STREAM');

    await owner.page.goto(
      `${base}/reports/money-received?storeId=${ids.storeA}&from=${day}&to=${day}`,
      { waitUntil: 'networkidle', timeout: 120000 },
    );
    text = await owner.page.locator('body').innerText();
    assert(/Money Received/i.test(text), 'missing Money Received title');
    assert(/Needs MoMo confirmation/i.test(text), 'missing Needs MoMo confirmation copy');
    assert(
      /Review MoMo confirmations|\/reports\/momo-confirmation/i.test(text) ||
        (await owner.page.locator('a[href*="/reports/momo-confirmation"]').count()) > 0,
      'missing Review MoMo confirmations link',
    );
    assert(text.includes(txnConfirmed) || /Money in|CONFIRMED|5\.00|50\.00/i.test(text), 'confirmed money missing');
    assert(!text.includes(txnPending), 'PENDING_MANUAL txn leaked into Money Received table');
    checks.push('money_received_link_and_exclusion');
    console.log('PASS Money Received link + PENDING_MANUAL excluded');

    await owner.page.goto(
      `${base}/reports/momo-confirmation?storeId=${ids.storeB}&from=${day}&to=${day}`,
      { waitUntil: 'networkidle', timeout: 120000 },
    );
    text = await owner.page.locator('body').innerText();
    assert(text.includes(txnBranchB), 'branch B MoMo row missing when scoped to store B');
    assert(!text.includes(txnPending), 'store A pending leaked into store B MoMo review');
    checks.push('branch_scoping_ok');
    console.log('PASS branch scoping');

    const manager = await login(base, managerEmail, password, bypass);
    assert(manager.ok, 'manager login failed');
    browsers.push(manager);
    await manager.page.goto(
      `${base}/reports/momo-confirmation?storeId=${ids.storeA}&from=${day}&to=${day}`,
      { waitUntil: 'networkidle', timeout: 120000 },
    );
    const managerText = await manager.page.locator('body').innerText();
    assert(
      /MoMo confirmation|Needs MoMo confirmation/i.test(managerText) &&
        !denied(managerText, manager.page.url()),
      'manager denied MoMo review',
    );
    const managerExport = await manager.page.request.get(
      `${base}/exports/momo-confirmation?storeId=${ids.storeA}&from=${day}&to=${day}`,
      {
        headers: bypass
          ? {
              'x-vercel-protection-bypass': bypass,
              'x-vercel-set-bypass-cookie': 'true',
            }
          : {},
      },
    );
    const managerExportText = await managerExport.text();
    assert(managerExport.status() === 200, `manager momo export ${managerExport.status()}`);
    assert(/COMPLETE_STREAM/i.test(managerExportText), 'manager momo export incomplete');
    checks.push('manager_ok');
    console.log('PASS manager access + export');

    const cashier = await login(base, cashierEmail, password, bypass);
    assert(cashier.ok, 'cashier login failed');
    browsers.push(cashier);
    await cashier.page.goto(`${base}/reports/momo-confirmation`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    const cashierText = await cashier.page.locator('body').innerText();
    assert(
      denied(cashierText, cashier.page.url()) ||
        !/PENDING_MANUAL/i.test(cashierText) ||
        /Access denied/i.test(cashierText),
      'cashier should be denied MoMo confirmation',
    );
    const cashierExport = await cashier.page.request.get(
      `${base}/exports/momo-confirmation?storeId=ALL`,
      {
        headers: bypass
          ? {
              'x-vercel-protection-bypass': bypass,
              'x-vercel-set-bypass-cookie': 'true',
            }
          : {},
      },
    );
    const cashierExportText = await cashierExport.text();
    assert(
      cashierExport.status() === 403 ||
        cashierExport.status() === 401 ||
        cashierExport.status() === 302 ||
        cashierExport.status() === 307 ||
        /login|denied|forbidden|not authorised|not authorized/i.test(cashierExportText) ||
        /<html/i.test(cashierExportText),
      `cashier momo export unexpectedly allowed status=${cashierExport.status()}`,
    );
    assert(!/COMPLETE_STREAM/i.test(cashierExportText), 'cashier got COMPLETE_STREAM');
    checks.push('cashier_denied');
    console.log('PASS cashier denial');

    console.log(JSON.stringify({ tag: TAG, base, checks }, null, 2));
    console.log('MOMO CONFIRMATION PREVIEW VALIDATION PASSED');
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    console.error(JSON.stringify({ checks }, null, 2));
    process.exit(err && err.exitCode ? err.exitCode : 1);
  } finally {
    for (const b of browsers) {
      try {
        await b.browser.close();
      } catch {
        /* ignore */
      }
    }
    try {
      await db.query(`DELETE FROM "SalesPayment" WHERE id = ANY($1::text[])`, [
        [ids.payConfirmed, ids.payPending, ids.payBranchB],
      ]);
      await db.query(`DELETE FROM "SalesInvoice" WHERE id = ANY($1::text[])`, [
        [ids.saleConfirmed, ids.salePending, ids.saleBranchB],
      ]);
      await db.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [
        [ids.owner, ids.manager, ids.cashier],
      ]);
      await db.query(`DELETE FROM "Till" WHERE id = ANY($1::text[])`, [[ids.tillA, ids.tillB]]);
      await db.query(`DELETE FROM "Store" WHERE id = ANY($1::text[])`, [[ids.storeA, ids.storeB]]);
      await db.query(`DELETE FROM "Business" WHERE id = $1`, [ids.business]);
    } catch (cleanupErr) {
      console.error('cleanup warning', cleanupErr.message || cleanupErr);
    }
    try {
      await db.end();
    } catch {
      /* ignore */
    }
  }
}

main();

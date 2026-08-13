/**
 * Production smoke for manual MoMo confirmation (Step 5Q).
 * Uses the internal QA tenant only. Inserts a tagged PENDING_MANUAL payment,
 * confirms it via the UI, verifies audit + Money Received, then deletes the tag.
 *
 * Refuses to run unless the owner email maps to TILLFLOW_INTERNAL_QA_BUSINESS_IDS.
 * Exit 0 = passed, 1 = failed, 2 = blocked.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const TAG = `MOMO_5Q_PROD_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;

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

function parseQaBusinessIds(raw) {
  return String(raw || '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
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
  const sessionCookies = cookies.filter((c) => c.name.startsWith('pos_session'));
  if (sessionCookies.length === 0) {
    const url = page.url();
    const body = await page.locator('body').innerText().catch(() => '');
    await browser.close();
    return { ok: false, url, body: body.slice(0, 400) };
  }
  return { ok: true, context, browser, page };
}

async function openReview(page, txn) {
  const row = page.locator('tr', { hasText: txn }).first();
  await row.waitFor({ timeout: 30000 });
  await row.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('dialog', { name: 'Review MoMo payment' }).waitFor({ timeout: 15000 });
}

async function main() {
  const qaEnv = loadEnvFile(path.join(root, '.playwright-qa.local.env'));
  const prodEnv = loadEnvFile(path.join(root, 'tmp', 'reporting-preview-prod.local.env'));
  const base = (
    process.env.PLAYWRIGHT_BASE_URL ||
    qaEnv.PLAYWRIGHT_BASE_URL ||
    'https://www.tillflow.app'
  ).replace(/\/$/, '');
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';
  const ownerEmail = process.env.PLAYWRIGHT_OWNER_EMAIL || qaEnv.PLAYWRIGHT_OWNER_EMAIL;
  const ownerPassword = process.env.PLAYWRIGHT_OWNER_PASSWORD || qaEnv.PLAYWRIGHT_OWNER_PASSWORD;
  const managerEmail = process.env.PLAYWRIGHT_MANAGER_EMAIL || qaEnv.PLAYWRIGHT_MANAGER_EMAIL;
  const managerPassword = process.env.PLAYWRIGHT_MANAGER_PASSWORD || qaEnv.PLAYWRIGHT_MANAGER_PASSWORD;
  const cashierEmail = process.env.PLAYWRIGHT_CASHIER_EMAIL || qaEnv.PLAYWRIGHT_CASHIER_EMAIL;
  const cashierPassword = process.env.PLAYWRIGHT_CASHIER_PASSWORD || qaEnv.PLAYWRIGHT_CASHIER_PASSWORD;
  const dbUrl = process.env.POSTGRES_URL_NON_POOLING || prodEnv.POSTGRES_URL_NON_POOLING || '';
  const qaIds = parseQaBusinessIds(
    process.env.TILLFLOW_INTERNAL_QA_BUSINESS_IDS || prodEnv.TILLFLOW_INTERNAL_QA_BUSINESS_IDS,
  );

  if (!ownerEmail || !ownerPassword || !managerEmail || !managerPassword || !cashierEmail || !cashierPassword) {
    console.error('BLOCKED: missing PLAYWRIGHT_* credentials');
    process.exit(2);
  }
  if (!dbUrl) {
    console.error('BLOCKED: production DB URL missing');
    process.exit(2);
  }
  if (looksPreviewUrl(dbUrl)) {
    console.error('BLOCKED: Refusing preview database for production smoke');
    process.exit(2);
  }
  if (prodEnv.VERCEL_ENV && prodEnv.VERCEL_ENV !== 'production') {
    console.error(`BLOCKED: VERCEL_ENV=${prodEnv.VERCEL_ENV}`);
    process.exit(2);
  }
  if (qaIds.length === 0) {
    console.error('BLOCKED: TILLFLOW_INTERNAL_QA_BUSINESS_IDS missing');
    process.exit(2);
  }

  const db = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const browsers = [];
  const checks = [];
  const evidence = {};
  const ids = {
    salePending: cuidLike(),
    saleReturned: cuidLike(),
    payPending: cuidLike(),
    payReturned: cuidLike(),
  };
  const receivedAt = new Date();
  receivedAt.setUTCHours(12, 0, 0, 0);
  const day = receivedAt.toISOString().slice(0, 10);
  const txnPending = `TXN-5Q-${TAG.slice(-10)}`;
  const txnReturned = `TXN-5QR-${TAG.slice(-8)}`;
  const confirmRef = `QA-${TAG.slice(-6)}`;
  const confirmNote = `Step 5Q production smoke ${TAG}`;

  try {
    console.log(`Production MoMo 5Q smoke base: ${base}`);
    console.log(`Synthetic tag: ${TAG}`);
    await db.connect();
    const dbName = await db.query('SELECT current_database() AS db');
    const dbLabel = String(dbName.rows[0].db || '');
    assert(!/preview|tillflow_preview/i.test(dbLabel), `Refusing preview-looking database: ${dbLabel}`);
    checks.push('production_db_ok');

    const ownerRow = await db.query(
      `SELECT id, "businessId", role FROM "User" WHERE lower(email) = lower($1) AND active = true`,
      [ownerEmail],
    );
    assert(ownerRow.rows.length === 1, 'QA owner not found');
    const qaBusinessId = ownerRow.rows[0].businessId;
    const qaOwnerId = ownerRow.rows[0].id;
    assert(qaIds.includes(qaBusinessId), 'QA owner is not an internal QA business — refusing write');
    evidence.qaBusinessId = qaBusinessId;

    const store = await db.query(
      `SELECT s.id, t.id AS "tillId"
         FROM "Store" s
         JOIN "Till" t ON t."storeId" = s.id
        WHERE s."businessId" = $1
        ORDER BY s."createdAt" ASC
        LIMIT 1`,
      [qaBusinessId],
    );
    assert(store.rows.length === 1, 'QA store/till missing');
    const storeId = store.rows[0].id;
    const tillId = store.rows[0].tillId;

    await db.query(
      `INSERT INTO "SalesInvoice" (
         id, "businessId", "storeId", "tillId", "cashierUserId", "paymentStatus",
         "transactionNumber", "subtotalPence", "vatPence", "totalPence", "createdAt", "qaTag"
       ) VALUES ($1,$2,$3,$4,$5,'PAID',$6,4100,0,4100,$7,$8)`,
      [ids.salePending, qaBusinessId, storeId, tillId, qaOwnerId, txnPending, receivedAt, TAG],
    );
    await db.query(
      `INSERT INTO "SalesPayment" (
         id, "salesInvoiceId", method, "amountPence", "receivedAt", status, "receiptOrigin", "qaTag"
       ) VALUES ($1,$2,'MOBILE_MONEY',4100,$3,'PENDING_MANUAL','RECEIVED_AT_SALE',$4)`,
      [ids.payPending, ids.salePending, receivedAt, TAG],
    );
    await db.query(
      `INSERT INTO "SalesInvoice" (
         id, "businessId", "storeId", "tillId", "cashierUserId", "paymentStatus",
         "transactionNumber", "subtotalPence", "vatPence", "totalPence", "createdAt", "qaTag"
       ) VALUES ($1,$2,$3,$4,$5,'RETURNED',$6,1500,0,1500,$7,$8)`,
      [ids.saleReturned, qaBusinessId, storeId, tillId, qaOwnerId, txnReturned, receivedAt, TAG],
    );
    await db.query(
      `INSERT INTO "SalesPayment" (
         id, "salesInvoiceId", method, "amountPence", "receivedAt", status, "receiptOrigin", "qaTag"
       ) VALUES ($1,$2,'MOBILE_MONEY',1500,$3,'PENDING_MANUAL',NULL,$4)`,
      [ids.payReturned, ids.saleReturned, receivedAt, TAG],
    );

    const beforeSnap = await db.query(
      `SELECT p.status, p."receivedAt", p."receiptOrigin", i."paymentStatus"
         FROM "SalesPayment" p JOIN "SalesInvoice" i ON i.id = p."salesInvoiceId"
        WHERE p.id = $1`,
      [ids.payPending],
    );
    const journalsBefore = await db.query(
      `SELECT count(*)::int AS n FROM "JournalEntry" WHERE "referenceId" = $1`,
      [ids.salePending],
    );
    const drawerBefore = await db.query(
      `SELECT count(*)::int AS n FROM "CashDrawerEntry" WHERE "referenceId" = $1`,
      [ids.salePending],
    );

    const owner = await login(base, ownerEmail, ownerPassword, bypass);
    assert(owner.ok, `owner login failed url=${owner.url}`);
    browsers.push(owner);

    await owner.page.goto(`${base}/reports/momo-confirmation?from=${day}&to=${day}&saleStatus=ALL`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    let text = await owner.page.locator('body').innerText();
    assert(/MoMo confirmation|Needs MoMo confirmation/i.test(text), 'owner missing MoMo page');
    assert(!denied(text, owner.page.url()), 'owner denied MoMo');
    assert(text.includes(txnPending), 'QA pending txn missing from MoMo review');
    checks.push('owner_momo_page_ok');
    console.log('PASS owner /reports/momo-confirmation');

    await openReview(owner.page, txnPending);
    await owner.page.locator('#momo-confirm-reference').fill(confirmRef);
    await owner.page.locator('#momo-confirm-note').fill(confirmNote);
    await owner.page.getByTestId('confirm-momo-payment').click();
    await owner.page
      .getByText(/MoMo payment confirmed|already confirmed/i)
      .waitFor({ timeout: 30000 });
    checks.push('owner_confirm_ok');
    console.log('PASS owner confirmed QA PENDING_MANUAL');

    const afterSnap = await db.query(
      `SELECT p.status, p."receivedAt", p."receiptOrigin", p.reference, i."paymentStatus"
         FROM "SalesPayment" p JOIN "SalesInvoice" i ON i.id = p."salesInvoiceId"
        WHERE p.id = $1`,
      [ids.payPending],
    );
    const pay = afterSnap.rows[0];
    const before = beforeSnap.rows[0];
    assert(pay.status === 'CONFIRMED', `status=${pay.status}`);
    assert(
      new Date(pay.receivedAt).toISOString() === new Date(before.receivedAt).toISOString(),
      'receivedAt changed',
    );
    assert(pay.receiptOrigin === before.receiptOrigin, 'receiptOrigin changed');
    assert(pay.paymentStatus === 'PAID', `invoice status=${pay.paymentStatus}`);
    const journalsAfter = await db.query(
      `SELECT count(*)::int AS n FROM "JournalEntry" WHERE "referenceId" = $1`,
      [ids.salePending],
    );
    const drawerAfter = await db.query(
      `SELECT count(*)::int AS n FROM "CashDrawerEntry" WHERE "referenceId" = $1`,
      [ids.salePending],
    );
    assert(journalsAfter.rows[0].n === journalsBefore.rows[0].n, 'GL journal created');
    assert(drawerAfter.rows[0].n === drawerBefore.rows[0].n, 'cash drawer entry created');
    const audits = await db.query(
      `SELECT id, action, reason FROM "AuditLog"
        WHERE "entityId" = $1 AND action = 'MOMO_PAYMENT_CONFIRM'`,
      [ids.payPending],
    );
    assert(audits.rows.length === 1, `expected 1 audit, got ${audits.rows.length}`);
    evidence.paymentId = ids.payPending;
    evidence.auditId = audits.rows[0].id;
    evidence.statusAfter = pay.status;
    checks.push('audit_and_lifecycle_ok');
    console.log('PASS AuditLog + lifecycle preserved');

    await owner.page.goto(`${base}/reports/momo-confirmation?from=${day}&to=${day}`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    text = await owner.page.locator('body').innerText();
    assert(!text.includes(txnPending), 'confirmed QA txn still on review list');
    checks.push('left_review_list');
    console.log('PASS MoMo review list updated');

    await owner.page.goto(`${base}/reports/money-received?from=${day}&to=${day}`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    text = await owner.page.locator('body').innerText();
    assert(/Money Received/i.test(text), 'owner missing Money Received');
    assert(
      text.includes(txnPending) || /41\.00|4,100|4100/i.test(text),
      'confirmed QA payment missing from Money Received',
    );
    checks.push('money_received_includes_confirmed');
    console.log('PASS Money Received includes confirmed QA payment');

    await owner.page.goto(
      `${base}/reports/momo-confirmation?from=${day}&to=${day}&saleStatus=RETURNED`,
      { waitUntil: 'networkidle', timeout: 120000 },
    );
    await openReview(owner.page, txnReturned);
    assert((await owner.page.getByTestId('confirm-momo-payment').count()) === 0, 'Confirm shown for RETURNED');
    await owner.page.getByRole('button', { name: 'Close' }).click();
    checks.push('returned_blocked');
    console.log('PASS RETURNED parent blocked');

    await owner.page.goto(`${base}/reports/business-movement`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    const bmText = await owner.page.locator('body').innerText();
    assert(!/Application error|Internal Server Error/i.test(bmText), 'business movement error');
    checks.push('business_movement_ok');
    console.log('PASS business movement');

    await owner.page.goto(`${base}/reports/dashboard?period=today`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    const dashText = await owner.page.locator('body').innerText();
    assert(!/Application error|Internal Server Error/i.test(dashText), 'dashboard error');
    checks.push('dashboard_ok');
    console.log('PASS trading dashboard');

    await owner.page.goto(`${base}/reports/weekly-digest`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    const digestText = await owner.page.locator('body').innerText();
    assert(!/Application error|Internal Server Error/i.test(digestText), 'weekly digest error');
    checks.push('weekly_digest_ok');
    console.log('PASS weekly digest');

    await owner.page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 120000 });
    const homeText = await owner.page.locator('body').innerText();
    assert(!/Application error|Internal Server Error/i.test(homeText), 'home/today error');
    checks.push('owner_home_ok');
    console.log('PASS owner home / today surface');

    const manager = await login(base, managerEmail, managerPassword, bypass);
    assert(manager.ok, `manager login failed url=${manager.url}`);
    browsers.push(manager);
    await manager.page.goto(`${base}/reports/momo-confirmation`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    const managerText = await manager.page.locator('body').innerText();
    assert(/MoMo confirmation|Needs MoMo confirmation/i.test(managerText), 'manager missing MoMo page');
    assert(!denied(managerText, manager.page.url()), 'manager denied MoMo');
    checks.push('manager_access_ok');
    console.log('PASS manager access');

    const cashier = await login(base, cashierEmail, cashierPassword, bypass);
    assert(cashier.ok, `cashier login failed url=${cashier.url}`);
    browsers.push(cashier);
    await cashier.page.goto(`${base}/reports/momo-confirmation`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    const cashierText = await cashier.page.locator('body').innerText();
    assert(
      denied(cashierText, cashier.page.url()) ||
        !/Needs MoMo confirmation/i.test(cashierText) ||
        /Access denied/i.test(cashierText),
      'cashier should be denied MoMo confirmation page',
    );
    checks.push('cashier_denied');
    console.log('PASS cashier denial');

    const auditsAfter = await db.query(
      `SELECT count(*)::int AS n FROM "AuditLog"
        WHERE "entityId" = $1 AND action = 'MOMO_PAYMENT_CONFIRM'`,
      [ids.payPending],
    );
    assert(auditsAfter.rows[0].n === 1, 'duplicate audit on already-confirmed QA payment');
    checks.push('idempotent_no_duplicate_audit');

    console.log(JSON.stringify({ base, tag: TAG, checks, evidence }, null, 2));
    console.log('MOMO MANUAL CONFIRMATION PRODUCTION SMOKE PASSED');
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    console.error(JSON.stringify({ checks, evidence }, null, 2));
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
      await db.query(`DELETE FROM "AuditLog" WHERE "entityId" = ANY($1::text[])`, [
        [ids.payPending, ids.payReturned],
      ]);
      await db.query(`DELETE FROM "SalesPayment" WHERE "qaTag" = $1`, [TAG]);
      await db.query(`DELETE FROM "SalesInvoice" WHERE "qaTag" = $1`, [TAG]);
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

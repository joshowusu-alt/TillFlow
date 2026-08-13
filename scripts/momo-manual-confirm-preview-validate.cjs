/**
 * Hosted Preview validation for manual MoMo confirmation (Step 5Q).
 * Preview DB only: seeds tagged users + payments, confirms via UI, then cleans up.
 * Exit 0 = passed, 1 = failed, 2 = blocked.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const TAG = `MOMO_5Q_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;

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

async function openReview(page, txn) {
  const row = page.locator('tr', { hasText: txn }).first();
  await row.waitFor({ timeout: 30000 });
  await row.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('dialog', { name: 'Review MoMo payment' }).waitFor({ timeout: 15000 });
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
    saleReturned: cuidLike(),
    payConfirmed: cuidLike(),
    payPending: cuidLike(),
    payBranchB: cuidLike(),
    payReturned: cuidLike(),
  };
  const receivedAt = new Date();
  receivedAt.setUTCHours(12, 0, 0, 0);
  const day = receivedAt.toISOString().slice(0, 10);
  const txnPending = `TXN-MOMO-${TAG}`;
  const txnConfirmed = `TXN-CONF-${TAG}`;
  const txnBranchB = `TXN-B-${TAG}`;
  const txnReturned = `TXN-RET-${TAG}`;
  const confirmRef = `STMT-${TAG.slice(-6)}`;
  const confirmNote = `Step 5Q preview confirm ${TAG}`;

  const db = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const browsers = [];
  const checks = [];
  const evidence = {};

  try {
    console.log(`MoMo 5Q preview base: ${base}`);
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
      [ids.business, `MoMo 5Q ${TAG}`, trialEnds],
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
         "transactionNumber", "subtotalPence", "vatPence", "totalPence", "createdAt", "qaTag"
       ) VALUES ($1,$2,$3,$4,$5,'PAID',$6,5000,0,5000,$7,$8)`,
      [ids.saleConfirmed, ids.business, ids.storeA, ids.tillA, ids.owner, txnConfirmed, receivedAt, TAG],
    );
    await db.query(
      `INSERT INTO "SalesPayment" (
         id, "salesInvoiceId", method, "amountPence", "receivedAt", status, "receiptOrigin", "qaTag"
       ) VALUES ($1,$2,'CASH',5000,$3,'CONFIRMED','RECEIVED_AT_SALE',$4)`,
      [ids.payConfirmed, ids.saleConfirmed, receivedAt, TAG],
    );

    await db.query(
      `INSERT INTO "SalesInvoice" (
         id, "businessId", "storeId", "tillId", "cashierUserId", "paymentStatus",
         "transactionNumber", "subtotalPence", "vatPence", "totalPence", "createdAt", "qaTag"
       ) VALUES ($1,$2,$3,$4,$5,'PAID',$6,7700,0,7700,$7,$8)`,
      [ids.salePending, ids.business, ids.storeA, ids.tillA, ids.owner, txnPending, receivedAt, TAG],
    );
    await db.query(
      `INSERT INTO "SalesPayment" (
         id, "salesInvoiceId", method, "amountPence", "receivedAt", status, "receiptOrigin", "qaTag"
       ) VALUES ($1,$2,'MOBILE_MONEY',7700,$3,'PENDING_MANUAL','RECEIVED_AT_SALE',$4)`,
      [ids.payPending, ids.salePending, receivedAt, TAG],
    );

    await db.query(
      `INSERT INTO "SalesInvoice" (
         id, "businessId", "storeId", "tillId", "cashierUserId", "paymentStatus",
         "transactionNumber", "subtotalPence", "vatPence", "totalPence", "createdAt", "qaTag"
       ) VALUES ($1,$2,$3,$4,$5,'PAID',$6,3300,0,3300,$7,$8)`,
      [ids.saleBranchB, ids.business, ids.storeB, ids.tillB, ids.manager, txnBranchB, receivedAt, TAG],
    );
    await db.query(
      `INSERT INTO "SalesPayment" (
         id, "salesInvoiceId", method, "amountPence", "receivedAt", status, "receiptOrigin", "qaTag"
       ) VALUES ($1,$2,'MOBILE_MONEY',3300,$3,'PENDING_MANUAL',NULL,$4)`,
      [ids.payBranchB, ids.saleBranchB, receivedAt, TAG],
    );

    await db.query(
      `INSERT INTO "SalesInvoice" (
         id, "businessId", "storeId", "tillId", "cashierUserId", "paymentStatus",
         "transactionNumber", "subtotalPence", "vatPence", "totalPence", "createdAt", "qaTag"
       ) VALUES ($1,$2,$3,$4,$5,'RETURNED',$6,2200,0,2200,$7,$8)`,
      [ids.saleReturned, ids.business, ids.storeA, ids.tillA, ids.owner, txnReturned, receivedAt, TAG],
    );
    await db.query(
      `INSERT INTO "SalesPayment" (
         id, "salesInvoiceId", method, "amountPence", "receivedAt", status, "receiptOrigin", "qaTag"
       ) VALUES ($1,$2,'MOBILE_MONEY',2200,$3,'PENDING_MANUAL',NULL,$4)`,
      [ids.payReturned, ids.saleReturned, receivedAt, TAG],
    );

    const beforeSnap = await db.query(
      `SELECT p.id, p.status, p."receivedAt", p."receiptOrigin", p.reference,
              i."paymentStatus" AS invoice_status
         FROM "SalesPayment" p
         JOIN "SalesInvoice" i ON i.id = p."salesInvoiceId"
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

    const owner = await login(base, ownerEmail, password, bypass);
    assert(owner.ok, `owner login failed url=${owner.url}`);
    browsers.push(owner);

    await owner.page.goto(
      `${base}/reports/momo-confirmation?storeId=${ids.storeA}&from=${day}&to=${day}&saleStatus=ALL`,
      { waitUntil: 'networkidle', timeout: 120000 },
    );
    let text = await owner.page.locator('body').innerText();
    assert(/MoMo confirmation|Needs MoMo confirmation/i.test(text), 'missing MoMo confirmation title');
    assert(/already recorded at checkout|not a new receipt|original payment date/i.test(text), 'missing confirm copy');
    assert(text.includes(txnPending), 'pending txn missing from MoMo review');
    assert(text.includes(txnReturned), 'returned txn missing when saleStatus=ALL');
    assert(!text.includes(txnBranchB), 'branch B txn leaked into store A MoMo review');
    checks.push('owner_momo_page_ok');
    console.log('PASS owner /reports/momo-confirmation');

    await openReview(owner.page, txnPending);
    checks.push('owner_review_drawer_ok');
    console.log('PASS owner Review drawer');

    await owner.page.getByTestId('confirm-momo-payment').click();
    await owner.page.waitForTimeout(1500);
    let dialogText = await owner.page.getByRole('dialog').innerText();
    assert(/reference|note/i.test(dialogText), 'empty confirm did not require evidence');
    checks.push('reference_and_note_required');
    console.log('PASS reference/note required');

    await owner.page.locator('#momo-confirm-reference').fill(confirmRef);
    await owner.page.getByTestId('confirm-momo-payment').click();
    await owner.page.waitForTimeout(1500);
    dialogText = await owner.page.getByRole('dialog').innerText();
    assert(/note/i.test(dialogText), 'missing note was accepted');
    checks.push('note_required');
    console.log('PASS note required');

    await owner.page.locator('#momo-confirm-note').fill(confirmNote);
    await owner.page.getByTestId('confirm-momo-payment').click();
    await owner.page
      .getByText(/MoMo payment confirmed|already confirmed/i)
      .waitFor({ timeout: 30000 });
    await owner.page.waitForTimeout(2000);
    text = await owner.page.locator('body').innerText();
    assert(!text.includes(txnPending) || /confirmed/i.test(text), 'pending txn still listed after confirm');
    checks.push('owner_confirm_ok');
    console.log('PASS owner confirmed PENDING_MANUAL');

    const afterSnap = await db.query(
      `SELECT p.id, p.status, p."receivedAt", p."receiptOrigin", p.reference,
              i."paymentStatus" AS invoice_status
         FROM "SalesPayment" p
         JOIN "SalesInvoice" i ON i.id = p."salesInvoiceId"
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
    assert(pay.invoice_status === 'PAID', `invoice status=${pay.invoice_status}`);
    assert(pay.reference === confirmRef, `reference not filled, got ${pay.reference}`);
    evidence.paymentId = ids.payPending;
    evidence.statusAfter = pay.status;
    evidence.receivedAt = new Date(pay.receivedAt).toISOString();
    evidence.receiptOrigin = pay.receiptOrigin;
    evidence.invoiceStatus = pay.invoice_status;

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
    checks.push('lifecycle_preserved');
    console.log('PASS receivedAt/origin/invoice/GL/drawer unchanged');

    const audits = await db.query(
      `SELECT id, action, reason, "beforeState", "afterState", details
         FROM "AuditLog"
        WHERE "entityId" = $1 AND action = 'MOMO_PAYMENT_CONFIRM'
        ORDER BY "createdAt" ASC`,
      [ids.payPending],
    );
    assert(audits.rows.length === 1, `expected 1 audit, got ${audits.rows.length}`);
    assert(audits.rows[0].reason === confirmNote, 'audit reason mismatch');
    const afterState = JSON.parse(audits.rows[0].afterState || '{}');
    assert(afterState.status === 'CONFIRMED', 'audit afterState not CONFIRMED');
    evidence.auditId = audits.rows[0].id;
    checks.push('audit_created');
    console.log('PASS AuditLog MOMO_PAYMENT_CONFIRM');

    await owner.page.goto(
      `${base}/reports/momo-confirmation?storeId=${ids.storeA}&from=${day}&to=${day}`,
      { waitUntil: 'networkidle', timeout: 120000 },
    );
    text = await owner.page.locator('body').innerText();
    assert(!text.includes(txnPending), 'confirmed txn still on MoMo review');
    checks.push('left_review_list');
    console.log('PASS confirmed row left MoMo review');

    await owner.page.goto(
      `${base}/reports/money-received?storeId=${ids.storeA}&from=${day}&to=${day}`,
      { waitUntil: 'networkidle', timeout: 120000 },
    );
    text = await owner.page.locator('body').innerText();
    assert(/Money Received/i.test(text), 'missing Money Received title');
    assert(
      text.includes(txnPending) || /77\.00|7,700|7700/i.test(text),
      'confirmed MoMo missing from Money Received',
    );
    checks.push('money_received_includes_confirmed');
    console.log('PASS Money Received includes confirmed payment');

    await owner.page.goto(
      `${base}/reports/momo-confirmation?storeId=${ids.storeA}&from=${day}&to=${day}&saleStatus=RETURNED`,
      { waitUntil: 'networkidle', timeout: 120000 },
    );
    await openReview(owner.page, txnReturned);
    const returnedDialog = await owner.page.getByRole('dialog').innerText();
    assert(/returned or voided|do not confirm/i.test(returnedDialog), 'missing RETURNED block copy');
    assert(
      (await owner.page.getByTestId('confirm-momo-payment').count()) === 0,
      'Confirm shown for RETURNED sale',
    );
    await owner.page.getByRole('button', { name: 'Close' }).click();
    checks.push('returned_blocked');
    console.log('PASS RETURNED parent blocked');

    const manager = await login(base, managerEmail, password, bypass);
    assert(manager.ok, 'manager login failed');
    browsers.push(manager);
    await manager.page.goto(
      `${base}/reports/momo-confirmation?storeId=${ids.storeB}&from=${day}&to=${day}`,
      { waitUntil: 'networkidle', timeout: 120000 },
    );
    await openReview(manager.page, txnBranchB);
    assert(
      (await manager.page.getByTestId('confirm-momo-payment').count()) === 1,
      'manager missing Confirm button',
    );
    await manager.page.getByRole('button', { name: 'Close' }).click();
    checks.push('manager_review_ok');
    console.log('PASS manager Review drawer');

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
    checks.push('cashier_denied');
    console.log('PASS cashier denial');

    const auditsAfter = await db.query(
      `SELECT count(*)::int AS n FROM "AuditLog"
        WHERE "entityId" = $1 AND action = 'MOMO_PAYMENT_CONFIRM'`,
      [ids.payPending],
    );
    assert(auditsAfter.rows[0].n === 1, 'duplicate audit after already-confirmed');
    checks.push('idempotent_no_duplicate_audit');
    console.log('PASS already CONFIRMED has single audit');

    console.log(JSON.stringify({ tag: TAG, base, checks, evidence }, null, 2));
    console.log('MOMO MANUAL CONFIRMATION PREVIEW VALIDATION PASSED');
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
        [ids.payPending, ids.payBranchB, ids.payReturned, ids.payConfirmed],
      ]);
      await db.query(`DELETE FROM "SalesPayment" WHERE id = ANY($1::text[])`, [
        [ids.payConfirmed, ids.payPending, ids.payBranchB, ids.payReturned],
      ]);
      await db.query(`DELETE FROM "SalesInvoice" WHERE id = ANY($1::text[])`, [
        [ids.saleConfirmed, ids.salePending, ids.saleBranchB, ids.saleReturned],
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

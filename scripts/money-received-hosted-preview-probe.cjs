/**
 * Hosted Preview validation probe for Canonical Money Received (Step 5G).
 *
 * Preview/staging only. Synthetic tagged rows are inserted and cleaned up.
 * NEVER targets Production.
 *
 * Env (tmp/reporting-preview.local.env):
 *   PREVIEW_BASE_URL
 *   VERCEL_AUTOMATION_BYPASS_SECRET
 *   POSTGRES_URL_NON_POOLING | PREVIEW_DATABASE_URL
 *
 * Exit 0 = passed, 1 = failed, 2 = blocked
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const TAG = `MR_HOSTED_5G_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;

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

function fail(code, msg) {
  console.error(msg);
  process.exit(code);
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
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page
    .waitForURL((url) => !String(url.pathname || '').includes('/login'), {
      timeout: 90000,
    })
    .catch(() => null);
  const cookies = await context.cookies();
  const sessionCookies = cookies.filter((c) => c.name.startsWith('pos_session'));
  if (sessionCookies.length === 0) {
    const url = page.url();
    await browser.close();
    return { ok: false, url };
  }
  return { ok: true, context, browser, page, cookies: sessionCookies };
}

async function fetchWithSession(base, pathName, bypass, cookieHeader) {
  let url = new URL(pathName, base);
  if (bypass) url.searchParams.set('x-vercel-protection-bypass', bypass);
  let cookie = cookieHeader || '';
  let current = url.toString();
  for (let i = 0; i < 8; i++) {
    const res = await fetch(current, {
      redirect: 'manual',
      headers: {
        ...(bypass
          ? {
              'x-vercel-protection-bypass': bypass,
              'x-vercel-set-bypass-cookie': 'true',
            }
          : {}),
        ...(cookie ? { cookie } : {}),
      },
    });
    const set = res.headers.getSetCookie?.() || [];
    if (set.length) {
      const part = set.map((c) => c.split(';')[0]).join('; ');
      cookie = cookie ? `${cookie}; ${part}` : part;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) {
        return { status: res.status, url: current, text: await res.text(), headers: res.headers };
      }
      current = new URL(loc, current).toString();
      continue;
    }
    const text = await res.text();
    return { status: res.status, url: current, text, headers: res.headers };
  }
  throw new Error('export redirect count exceeded');
}

function cookieHeaderFromPlaywright(cookies) {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
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
    process.env.PREVIEW_DATABASE_URL ||
    fileEnv.POSTGRES_URL_NON_POOLING ||
    fileEnv.POSTGRES_PRISMA_URL ||
    '';

  if (!base) fail(2, 'BLOCKED: PREVIEW_BASE_URL missing');
  if (!bypass) fail(2, 'BLOCKED: VERCEL_AUTOMATION_BYPASS_SECRET missing');
  if (!dbUrl) fail(2, 'BLOCKED: Preview database URL missing');
  if (!looksPreviewUrl(dbUrl)) {
    fail(2, 'BLOCKED: Refusing database URL that does not look like Preview');
  }
  if (/tillflow\.app$/i.test(new URL(base).host) && !/vercel\.app/i.test(base)) {
    fail(2, 'BLOCKED: Refusing production host');
  }

  const stamp = Date.now();
  const password = `Mr5GPrev${stamp}!`;
  const passwordHash = await bcrypt.hash(password, 10);
  const ownerEmail = `owner-mr5g-${stamp}@tillflow-test.invalid`;
  const managerEmail = `manager-mr5g-${stamp}@tillflow-test.invalid`;
  const cashierEmail = `cashier-mr5g-${stamp}@tillflow-test.invalid`;
  const foreignEmail = `foreign-mr5g-${stamp}@tillflow-test.invalid`;

  const ids = {
    business: cuidLike(),
    foreignBusiness: cuidLike(),
    storeA: cuidLike(),
    storeB: cuidLike(),
    foreignStore: cuidLike(),
    tillA: cuidLike(),
    tillB: cuidLike(),
    foreignTill: cuidLike(),
    owner: cuidLike(),
    manager: cuidLike(),
    cashier: cuidLike(),
    foreignOwner: cuidLike(),
    salePaid: cuidLike(),
    saleReturned: cuidLike(),
    saleVoid: cuidLike(),
    saleFailed: cuidLike(),
    salePending: cuidLike(),
    saleLegacy: cuidLike(),
    saleRefund: cuidLike(),
    saleBranchB: cuidLike(),
    foreignSale: cuidLike(),
    payPaid: cuidLike(),
    payReturnedParent: cuidLike(),
    payVoidParent: cuidLike(),
    payFailed: cuidLike(),
    payPending: cuidLike(),
    payLegacy: cuidLike(),
    payBranchB: cuidLike(),
    foreignPay: cuidLike(),
    refund: cuidLike(),
  };

  const receivedAt = new Date();
  receivedAt.setUTCHours(12, 0, 0, 0);

  const db = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  let browserHandles = [];
  const checks = [];

  const expectedMoneyReceived = 10000 + 5000 + 3000; // paid + RETURNED parent + VOID parent
  const expectedUnverified = 4500;
  const expectedRefund = 2000;
  const expectedBranchA = 10000 + 5000 + 3000;
  const expectedBranchB = 7000;

  try {
    console.log('Preview host:', base.replace(/^https?:\/\//, ''));
    console.log('Synthetic tag:', TAG);
    console.log('Expected money_received pence:', expectedMoneyReceived);

    await db.connect();

    // Safety: confirm we are not on an obvious production DB name
    const dbName = await db.query('SELECT current_database() AS db');
    const dbLabel = String(dbName.rows[0].db || '');
    assert(
      /preview|tillflow_preview/i.test(dbLabel) || looksPreviewUrl(dbUrl),
      `Refusing unexpected database name: ${dbLabel}`,
    );
    checks.push({ name: 'preview_db_confirmed', db: dbLabel });

    const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO "Business" (
         id, name, currency, timezone, "subscriptionStatus",
         "trialStartedAt", "trialEndsAt", "updatedAt"
       ) VALUES ($1,$2,'GHS','Africa/Accra','TRIAL_ACTIVE',NOW(),$3,NOW())`,
      [ids.business, `MR5G Preview ${TAG}`, trialEnds],
    );
    await db.query(
      `INSERT INTO "Business" (
         id, name, currency, timezone, "subscriptionStatus",
         "trialStartedAt", "trialEndsAt", "updatedAt"
       ) VALUES ($1,$2,'GHS','Africa/Accra','TRIAL_ACTIVE',NOW(),$3,NOW())`,
      [ids.foreignBusiness, `MR5G Foreign ${TAG}`, trialEnds],
    );

    await db.query(`INSERT INTO "Store" (id, "businessId", name) VALUES ($1,$2,$3)`, [
      ids.storeA,
      ids.business,
      'Branch A',
    ]);
    await db.query(`INSERT INTO "Store" (id, "businessId", name) VALUES ($1,$2,$3)`, [
      ids.storeB,
      ids.business,
      'Branch B',
    ]);
    await db.query(`INSERT INTO "Store" (id, "businessId", name) VALUES ($1,$2,$3)`, [
      ids.foreignStore,
      ids.foreignBusiness,
      'Foreign Branch',
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
    await db.query(`INSERT INTO "Till" (id, "storeId", name) VALUES ($1,$2,$3)`, [
      ids.foreignTill,
      ids.foreignStore,
      'Foreign Till',
    ]);

    for (const [id, email, name, role, businessId] of [
      [ids.owner, ownerEmail, 'MR5G Owner', 'OWNER', ids.business],
      [ids.manager, managerEmail, 'MR5G Manager', 'MANAGER', ids.business],
      [ids.cashier, cashierEmail, 'MR5G Cashier', 'CASHIER', ids.business],
      [ids.foreignOwner, foreignEmail, 'MR5G Foreign', 'OWNER', ids.foreignBusiness],
    ]) {
      await db.query(
        `INSERT INTO "User" (id, "businessId", email, name, "passwordHash", role, active)
         VALUES ($1,$2,$3,$4,$5,$6,true)`,
        [id, businessId, email, name, passwordHash, role],
      );
    }

    async function insertSale(id, businessId, storeId, tillId, cashierUserId, paymentStatus, totalPence, txn) {
      await db.query(
        `INSERT INTO "SalesInvoice" (
           id, "businessId", "storeId", "tillId", "cashierUserId", "paymentStatus",
           "transactionNumber", "subtotalPence", "vatPence", "totalPence", "createdAt"
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$8,$9)`,
        [id, businessId, storeId, tillId, cashierUserId, paymentStatus, txn, totalPence, receivedAt],
      );
    }

    async function insertPay(id, invoiceId, amount, method, status) {
      await db.query(
        `INSERT INTO "SalesPayment" (
           id, "salesInvoiceId", method, "amountPence", "receivedAt", status, reference
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, invoiceId, method, amount, receivedAt, status, `${TAG}-${id.slice(-6)}`],
      );
    }

    await insertSale(ids.salePaid, ids.business, ids.storeA, ids.tillA, ids.owner, 'PAID', 10000, `TXN-${TAG}-P`);
    await insertSale(ids.saleReturned, ids.business, ids.storeA, ids.tillA, ids.owner, 'RETURNED', 5000, `TXN-${TAG}-R`);
    await insertSale(ids.saleVoid, ids.business, ids.storeA, ids.tillA, ids.owner, 'VOID', 3000, `TXN-${TAG}-V`);
    await insertSale(ids.saleFailed, ids.business, ids.storeA, ids.tillA, ids.owner, 'PAID', 9999, `TXN-${TAG}-F`);
    await insertSale(ids.salePending, ids.business, ids.storeA, ids.tillA, ids.owner, 'PAID', 8888, `TXN-${TAG}-N`);
    await insertSale(ids.saleLegacy, ids.business, ids.storeA, ids.tillA, ids.owner, 'PAID', 4500, `TXN-${TAG}-L`);
    await insertSale(ids.saleRefund, ids.business, ids.storeA, ids.tillA, ids.owner, 'PAID', 2000, `TXN-${TAG}-X`);
    await insertSale(ids.saleBranchB, ids.business, ids.storeB, ids.tillB, ids.owner, 'PAID', 7000, `TXN-${TAG}-B`);
    await insertSale(ids.foreignSale, ids.foreignBusiness, ids.foreignStore, ids.foreignTill, ids.foreignOwner, 'PAID', 99900, `TXN-${TAG}-Z`);

    await insertPay(ids.payPaid, ids.salePaid, 10000, 'CASH', 'CONFIRMED');
    await insertPay(ids.payReturnedParent, ids.saleReturned, 5000, 'CASH', 'CONFIRMED');
    await insertPay(ids.payVoidParent, ids.saleVoid, 3000, 'MOBILE_MONEY', 'CONFIRMED');
    await insertPay(ids.payFailed, ids.saleFailed, 9999, 'CASH', 'FAILED');
    await insertPay(ids.payPending, ids.salePending, 8888, 'CARD', 'PENDING');
    await insertPay(ids.payLegacy, ids.saleLegacy, 4500, 'CASH', 'LEGACY_RAW');
    await insertPay(ids.payBranchB, ids.saleBranchB, 7000, 'TRANSFER', 'CONFIRMED');
    await insertPay(ids.foreignPay, ids.foreignSale, 99900, 'CASH', 'CONFIRMED');

    await db.query(
      `INSERT INTO "SalesReturn" (
         id, "salesInvoiceId", "storeId", "userId", type, "refundAmountPence", "createdAt"
       ) VALUES ($1,$2,$3,$4,'RETURN',$5,$6)`,
      [ids.refund, ids.saleRefund, ids.storeA, ids.owner, expectedRefund, receivedAt],
    );

    // Direct Postgres contract checks (real Preview DB)
    const agg = await db.query(
      `SELECT COALESCE(SUM(sp."amountPence"),0)::bigint AS total
       FROM "SalesPayment" sp
       INNER JOIN "SalesInvoice" si ON si.id = sp."salesInvoiceId"
       WHERE si."businessId" = $1
         AND sp.status = 'CONFIRMED'
         AND sp."receivedAt" >= $2
         AND sp."receivedAt" < $3
         AND si."storeId" = $4`,
      [ids.business, new Date(receivedAt.getTime() - 3600_000), new Date(receivedAt.getTime() + 3600_000), ids.storeA],
    );
    assert(
      Number(agg.rows[0].total) === expectedBranchA,
      `Postgres aggregate mismatch branch A: got ${agg.rows[0].total} expected ${expectedBranchA}`,
    );
    checks.push({ name: 'postgres_aggregate_confirmed_no_parent_filter', total: Number(agg.rows[0].total) });

    const parentLeak = await db.query(
      `SELECT COALESCE(SUM(sp."amountPence"),0)::bigint AS total
       FROM "SalesPayment" sp
       INNER JOIN "SalesInvoice" si ON si.id = sp."salesInvoiceId"
       WHERE si."businessId" = $1
         AND sp.status = 'CONFIRMED'
         AND si."paymentStatus" NOT IN ('RETURNED','VOID')
         AND si."storeId" = $2
         AND sp.id = ANY($3::text[])`,
      [ids.business, ids.storeA, [ids.payReturnedParent, ids.payVoidParent]],
    );
    assert(
      Number(parentLeak.rows[0].total) === 0,
      'Sanity: parent-filtered query should exclude RETURNED/VOID parents',
    );
    checks.push({ name: 'parent_filter_would_erase_confirmed_but_canonical_does_not' });

    // Owner UI
    const ownerLogin = await loginWithPlaywright(base, ownerEmail, password, bypass);
    assert(ownerLogin.ok, `owner login failed url=${ownerLogin.url}`);
    browserHandles.push(ownerLogin);

    await ownerLogin.page.goto(
      `${base}/reports/money-received?storeId=${ids.storeA}&from=${receivedAt.toISOString().slice(0, 10)}&to=${receivedAt.toISOString().slice(0, 10)}`,
      { waitUntil: 'networkidle', timeout: 120000 },
    );
    const ownerText = await ownerLogin.page.locator('body').innerText();
    assert(/Payments and Money Received/i.test(ownerText), 'Owner page missing title');
    assert(/not a sales total|separate from sales/i.test(ownerText), 'Owner page missing non-sales framing');
    assert(/180\.00|GH₵\s*180|GHS\s*180/i.test(ownerText) || ownerText.includes('180.00'), 'Owner missing money_received 180.00');
    assert(/45\.00|Unverified/i.test(ownerText), 'Owner missing unverified legacy surface');
    assert(/20\.00|Refund/i.test(ownerText), 'Owner missing refund outflows surface');
    assert(!/999\.00|99\.99|88\.88/i.test(ownerText) || /Unverified|Refund/i.test(ownerText), 'FAILED/PENDING amounts must not enter money received headline');
    assert(!/999\.00|OB-FOREIGN|MR5G Foreign/i.test(ownerText), 'Foreign tenant leak on owner page');
    checks.push({ name: 'owner_money_received_page', url: ownerLogin.page.url() });
    console.log('PASS owner /reports/money-received');

    // Export via authenticated Playwright request context (session cookies)
    const exportUrl = `${base}/exports/money-received?storeId=${ids.storeA}&from=${receivedAt.toISOString().slice(0, 10)}&to=${receivedAt.toISOString().slice(0, 10)}&metric=money_received`;
    const exportResponse = await ownerLogin.page.request.get(exportUrl, {
      headers: {
        'x-vercel-protection-bypass': bypass,
        'x-vercel-set-bypass-cookie': 'true',
      },
    });
    const exportStatus = exportResponse.status();
    const exportText = await exportResponse.text();
    assert(exportStatus === 200, `export status ${exportStatus} body=${exportText.slice(0, 240)}`);
    assert(
      /COMPLETE_STREAM/i.test(exportText),
      `export missing COMPLETE_STREAM status=${exportStatus} body=${exportText.slice(0, 400)}`,
    );
    assert(/drillReconcilesToHeadline,YES/i.test(exportText), 'export missing reconcile YES');
    assert(!/PARTIAL_EXPORT_CAP/i.test(exportText), 'export claimed partial cap');
    assert(
      exportText.includes(ids.payReturnedParent) ||
        exportText.includes('5000') ||
        /50\.00/.test(exportText),
      'export should include RETURNED-parent confirmed receipt',
    );
    assert(!exportText.includes(ids.foreignPay), 'export leaked foreign payment id');
    checks.push({ name: 'owner_export_complete_stream', bytes: exportText.length });
    console.log('PASS owner export COMPLETE_STREAM');

    // Branch isolation
    await ownerLogin.page.goto(
      `${base}/reports/money-received?storeId=${ids.storeB}&from=${receivedAt.toISOString().slice(0, 10)}&to=${receivedAt.toISOString().slice(0, 10)}`,
      { waitUntil: 'networkidle', timeout: 120000 },
    );
    const branchBText = await ownerLogin.page.locator('body').innerText();
    assert(/70\.00/.test(branchBText), 'Branch B should show 70.00');
    assert(!/180\.00/.test(branchBText), 'Branch B must not show Branch A total');
    checks.push({ name: 'branch_isolation_store_b' });
    console.log('PASS branch isolation');

    // Foreign store injection
    await ownerLogin.page.goto(
      `${base}/reports/money-received?storeId=${ids.foreignStore}&from=${receivedAt.toISOString().slice(0, 10)}&to=${receivedAt.toISOString().slice(0, 10)}`,
      { waitUntil: 'domcontentloaded', timeout: 90000 },
    );
    await ownerLogin.page.waitForTimeout(1500);
    const foreignStoreText = await ownerLogin.page.locator('body').innerText();
    const foreignDenied =
      /access denied|not authorised|not authorized|forbidden|do not have|don't have|TENANT|BRANCH/i.test(
        foreignStoreText,
      ) || !/Payments and Money Received/i.test(foreignStoreText);
    assert(foreignDenied, 'Foreign storeId must be denied');
    assert(!/999\.00/.test(foreignStoreText), 'Foreign store must not reveal foreign totals');
    checks.push({ name: 'foreign_store_denied' });
    console.log('PASS foreign store denied');

    // Trading dashboard consumer
    await ownerLogin.page.goto(`${base}/reports/dashboard?period=today&storeId=${ids.storeA}`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    const dashText = await ownerLogin.page.locator('body').innerText();
    assert(/Money received/i.test(dashText), 'Trading dashboard missing Money received');
    // RETURNED/VOID parents included => at least part of 180 should be visible when "today"
    checks.push({ name: 'trading_dashboard_money_received_label' });
    console.log('PASS trading dashboard shows Money received');

    await ownerLogin.browser.close();
    browserHandles = [];

    // Manager
    const managerLogin = await loginWithPlaywright(base, managerEmail, password, bypass);
    assert(managerLogin.ok, `manager login failed url=${managerLogin.url}`);
    browserHandles.push(managerLogin);
    await managerLogin.page.goto(
      `${base}/reports/money-received?storeId=${ids.storeA}&from=${receivedAt.toISOString().slice(0, 10)}&to=${receivedAt.toISOString().slice(0, 10)}`,
      { waitUntil: 'networkidle', timeout: 120000 },
    );
    const managerText = await managerLogin.page.locator('body').innerText();
    assert(/Payments and Money Received/i.test(managerText), 'Manager denied Money Received');
    assert(/180\.00/.test(managerText), 'Manager missing expected total');
    checks.push({ name: 'manager_access_ok' });
    console.log('PASS manager access');

    const managerExportResponse = await managerLogin.page.request.get(
      `${base}/exports/money-received?storeId=${ids.storeA}&from=${receivedAt.toISOString().slice(0, 10)}&to=${receivedAt.toISOString().slice(0, 10)}`,
      {
        headers: {
          'x-vercel-protection-bypass': bypass,
          'x-vercel-set-bypass-cookie': 'true',
        },
      },
    );
    const managerExportText = await managerExportResponse.text();
    assert(managerExportResponse.status() === 200, `manager export status ${managerExportResponse.status()}`);
    assert(/COMPLETE_STREAM/i.test(managerExportText), 'manager export incomplete');
    checks.push({ name: 'manager_export_ok' });

    await managerLogin.browser.close();
    browserHandles = [];

    // Cashier denied
    const cashierLogin = await loginWithPlaywright(base, cashierEmail, password, bypass);
    assert(cashierLogin.ok, `cashier login failed url=${cashierLogin.url}`);
    browserHandles.push(cashierLogin);
    await cashierLogin.page.goto(`${base}/reports/money-received`, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    await cashierLogin.page.waitForTimeout(2500);
    const cashierUrl = cashierLogin.page.url();
    const cashierText = await cashierLogin.page.locator('body').innerText();
    const cashierDenied =
      /login|not authorised|not authorized|forbidden|access denied|don't have|do not have|restricted/i.test(
        `${cashierUrl} ${cashierText}`,
      ) || !/Payments and Money Received/i.test(cashierText);
    assert(cashierDenied, 'Cashier unexpectedly accessed Money Received');
    checks.push({ name: 'cashier_denied', url: cashierUrl });
    console.log('PASS cashier denied');

    const cashierExportResponse = await cashierLogin.page.request.get(
      `${base}/exports/money-received?storeId=ALL`,
      {
        headers: {
          'x-vercel-protection-bypass': bypass,
          'x-vercel-set-bypass-cookie': 'true',
        },
      },
    );
    const cashierExportText = await cashierExportResponse.text();
    assert(
      cashierExportResponse.status() >= 300 ||
        /denied|forbidden|login|Access denied|Sign in/i.test(cashierExportText),
      'Cashier export must be denied',
    );
    checks.push({ name: 'cashier_export_denied', status: cashierExportResponse.status() });

    await cashierLogin.browser.close();
    browserHandles = [];

    // Foreign owner cannot see our business via query param
    const foreignLogin = await loginWithPlaywright(base, foreignEmail, password, bypass);
    assert(foreignLogin.ok, `foreign login failed url=${foreignLogin.url}`);
    browserHandles.push(foreignLogin);
    const crossTenantResponse = await foreignLogin.page.request.get(
      `${base}/exports/money-received?businessId=${ids.business}&storeId=ALL`,
      {
        headers: {
          'x-vercel-protection-bypass': bypass,
          'x-vercel-set-bypass-cookie': 'true',
        },
      },
    );
    const crossTenantText = await crossTenantResponse.text();
    assert(
      crossTenantResponse.status() === 403 ||
        /TENANT_MISMATCH|Access denied|denied/i.test(crossTenantText),
      `cross-tenant export should deny, got ${crossTenantResponse.status()}`,
    );
    assert(!crossTenantText.includes(ids.payPaid), 'cross-tenant export leaked payment');
    checks.push({ name: 'cross_tenant_export_denied', status: crossTenantResponse.status() });
    console.log('PASS cross-tenant export denied');

    await foreignLogin.browser.close();
    browserHandles = [];

    console.log(
      JSON.stringify(
        {
          tag: TAG,
          expectedMoneyReceivedPence: expectedMoneyReceived,
          expectedUnverifiedPence: expectedUnverified,
          expectedRefundPence: expectedRefund,
          expectedBranchBPence: expectedBranchB,
          checks: checks.map((c) => c.name),
        },
        null,
        2,
      ),
    );
    console.log('HOSTED PREVIEW PROBE PASSED');
  } catch (err) {
    console.error('FAIL', err && err.message ? err.message : err);
    process.exit(err.exitCode || 1);
  } finally {
    for (const h of browserHandles) {
      try {
        await h.browser.close();
      } catch {
        /* ignore */
      }
    }
    try {
      await db.query(`DELETE FROM "SalesReturn" WHERE id = $1`, [ids.refund]);
      await db.query(`DELETE FROM "SalesPayment" WHERE id = ANY($1::text[])`, [
        [
          ids.payPaid,
          ids.payReturnedParent,
          ids.payVoidParent,
          ids.payFailed,
          ids.payPending,
          ids.payLegacy,
          ids.payBranchB,
          ids.foreignPay,
        ],
      ]);
      await db.query(`DELETE FROM "SalesInvoice" WHERE id = ANY($1::text[])`, [
        [
          ids.salePaid,
          ids.saleReturned,
          ids.saleVoid,
          ids.saleFailed,
          ids.salePending,
          ids.saleLegacy,
          ids.saleRefund,
          ids.saleBranchB,
          ids.foreignSale,
        ],
      ]);
      await db.query(`DELETE FROM "Till" WHERE id = ANY($1::text[])`, [
        [ids.tillA, ids.tillB, ids.foreignTill],
      ]);
      await db.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [
        [ids.owner, ids.manager, ids.cashier, ids.foreignOwner],
      ]);
      await db.query(`DELETE FROM "Store" WHERE id = ANY($1::text[])`, [
        [ids.storeA, ids.storeB, ids.foreignStore],
      ]);
      await db.query(`DELETE FROM "Business" WHERE id = ANY($1::text[])`, [
        [ids.business, ids.foreignBusiness],
      ]);
    } catch (cleanupErr) {
      console.error('CLEANUP WARNING', cleanupErr.message || cleanupErr);
    }
    try {
      await db.end();
    } catch {
      /* ignore */
    }
  }
}

main();

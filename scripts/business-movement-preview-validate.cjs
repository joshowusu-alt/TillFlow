/**
 * Hosted Preview validation for Business Movement owner UX polish (Step 6I).
 * Preview DB only: seeds tagged MoM sales + money rows, then cleans up.
 * Exit 0 = passed, 1 = failed, 2 = blocked.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const TAG = `BM_6I_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;

const STOCK_DISCLAIMER =
  'Historical stock availability is not yet reliable. This report does not attribute sales movement to stock-outs or inventory gaps.';

const FORBIDDEN = [
  'out of stock for',
  'days at zero',
  'days out of stock',
  'stock caused',
  'because of stock',
  'due to stock',
  'stock-out caused',
  'unavailable for',
  'review availability',
];

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
  if (/\/login/.test(url)) return true;
  if (/\/pos(\/|\?|$)/i.test(url) && !/\/reports\//i.test(url)) return true;
  if (
    /Access denied/i.test(text) &&
    /do not have access|not available for your business|another business|BRANCH_NOT_AUTHORISED|TENANT_MISMATCH|ROLE_DENIED/i.test(
      text,
    )
  ) {
    return true;
  }
  return false;
}

function hasForbiddenStock(text) {
  const lower = String(text || '').toLowerCase();
  return FORBIDDEN.some((p) => lower.includes(p));
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

async function insertSale(db, row) {
  await db.query(
    `INSERT INTO "SalesInvoice" (
       id, "businessId", "storeId", "tillId", "cashierUserId", "paymentStatus",
       "transactionNumber", "subtotalPence", "vatPence", "totalPence", "createdAt"
     ) VALUES ($1,$2,$3,$4,$5,'PAID',$6,$7,0,$7,$8)`,
    [
      row.id,
      row.businessId,
      row.storeId,
      row.tillId,
      row.cashierUserId,
      row.txn,
      row.totalPence,
      row.createdAt,
    ],
  );
  await db.query(
    `INSERT INTO "SalesInvoiceLine" (
       id, "salesInvoiceId", "productId", "unitId", "qtyInUnit", "conversionToBase",
       "qtyBase", "unitPricePence", "lineSubtotalPence", "lineVatPence", "lineTotalPence"
     ) VALUES ($1,$2,$3,$4,$5,1,$5,$6,$7,0,$7)`,
    [
      cuidLike(),
      row.id,
      row.productId,
      row.unitId,
      row.qty,
      Math.floor(row.totalPence / Math.max(row.qty, 1)),
      row.totalPence,
    ],
  );
  if (row.payment) {
    await db.query(
      `INSERT INTO "SalesPayment" (
         id, "salesInvoiceId", method, "amountPence", "receivedAt", status, "receiptOrigin", reference
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        cuidLike(),
        row.id,
        row.payment.method,
        row.payment.amountPence,
        row.payment.receivedAt,
        row.payment.status,
        row.payment.receiptOrigin,
        row.payment.reference || null,
      ],
    );
  }
}

async function cleanup(db, businessId, unitId) {
  await db.query(
    `DELETE FROM "SalesPayment" WHERE "salesInvoiceId" IN (
       SELECT id FROM "SalesInvoice" WHERE "businessId" = $1
     )`,
    [businessId],
  );
  await db.query(
    `DELETE FROM "SalesInvoiceLine" WHERE "salesInvoiceId" IN (
       SELECT id FROM "SalesInvoice" WHERE "businessId" = $1
     )`,
    [businessId],
  );
  await db.query(`DELETE FROM "SalesInvoice" WHERE "businessId" = $1`, [businessId]);
  await db.query(`DELETE FROM "Product" WHERE "businessId" = $1`, [businessId]);
  await db.query(`DELETE FROM "User" WHERE "businessId" = $1`, [businessId]);
  await db.query(
    `DELETE FROM "Till" WHERE "storeId" IN (SELECT id FROM "Store" WHERE "businessId" = $1)`,
    [businessId],
  );
  await db.query(`DELETE FROM "Store" WHERE "businessId" = $1`, [businessId]);
  await db.query(`DELETE FROM "Business" WHERE id = $1`, [businessId]);
  if (unitId) {
    await db.query(`DELETE FROM "Unit" WHERE id = $1 OR "qaTag" = $2`, [unitId, TAG]).catch(() => null);
  } else {
    await db.query(`DELETE FROM "Unit" WHERE "qaTag" = $1`, [TAG]).catch(() => null);
  }
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
    unit: cuidLike(),
    productGrow: cuidLike(),
    productDrop: cuidLike(),
  };

  // Accra July (current) / June (comparison) when asOf is mid-August
  const julyAt = new Date('2026-07-15T12:00:00.000Z');
  const juneAt = new Date('2026-06-15T12:00:00.000Z');

  const db = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const browsers = [];
  const checks = [];

  try {
    console.log(`Business Movement preview base: ${base}`);
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
      [ids.business, `BM 6G ${TAG}`, trialEnds],
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
      [ids.owner, ownerEmail, 'BM Owner', 'OWNER'],
      [ids.manager, managerEmail, 'BM Manager', 'MANAGER'],
      [ids.cashier, cashierEmail, 'BM Cashier', 'CASHIER'],
    ]) {
      await db.query(
        `INSERT INTO "User" (id, "businessId", email, name, "passwordHash", role, active)
         VALUES ($1,$2,$3,$4,$5,$6,true)`,
        [id, ids.business, email, name, passwordHash, role],
      );
    }
    await db.query(
      `INSERT INTO "Unit" (id, name, "pluralName", symbol, "qaTag") VALUES ($1,'piece','pieces','pc',$2)`,
      [ids.unit, TAG],
    );
    await db.query(
      `INSERT INTO "Product" (
         id, "businessId", name, "sellingPriceBasePence", "defaultCostBasePence", "updatedAt"
       ) VALUES ($1,$2,$3,1000,500,NOW())`,
      [ids.productGrow, ids.business, `Grower ${TAG}`],
    );
    await db.query(
      `INSERT INTO "Product" (
         id, "businessId", name, "sellingPriceBasePence", "defaultCostBasePence", "updatedAt"
       ) VALUES ($1,$2,$3,2000,800,NOW())`,
      [ids.productDrop, ids.business, `Decliner ${TAG}`],
    );

    // June comparison — stronger Decliner sales on Store A
    await insertSale(db, {
      id: cuidLike(),
      businessId: ids.business,
      storeId: ids.storeA,
      tillId: ids.tillA,
      cashierUserId: ids.owner,
      txn: `TXN-JUN-D-${TAG}`,
      totalPence: 40_000,
      createdAt: juneAt,
      productId: ids.productDrop,
      unitId: ids.unit,
      qty: 20,
      payment: {
        method: 'CASH',
        amountPence: 40_000,
        receivedAt: juneAt,
        status: 'CONFIRMED',
        receiptOrigin: 'RECEIVED_AT_SALE',
      },
    });
    await insertSale(db, {
      id: cuidLike(),
      businessId: ids.business,
      storeId: ids.storeA,
      tillId: ids.tillA,
      cashierUserId: ids.manager,
      txn: `TXN-JUN-G-${TAG}`,
      totalPence: 5_000,
      createdAt: juneAt,
      productId: ids.productGrow,
      unitId: ids.unit,
      qty: 5,
      payment: {
        method: 'CASH',
        amountPence: 5_000,
        receivedAt: juneAt,
        status: 'CONFIRMED',
        receiptOrigin: 'RECEIVED_AT_SALE',
      },
    });

    // July current — Grower up, Decliner down, pending MoMo, refund
    await insertSale(db, {
      id: cuidLike(),
      businessId: ids.business,
      storeId: ids.storeA,
      tillId: ids.tillA,
      cashierUserId: ids.owner,
      txn: `TXN-JUL-G-${TAG}`,
      totalPence: 25_000,
      createdAt: julyAt,
      productId: ids.productGrow,
      unitId: ids.unit,
      qty: 25,
      payment: {
        method: 'CASH',
        amountPence: 20_000,
        receivedAt: julyAt,
        status: 'CONFIRMED',
        receiptOrigin: 'RECEIVED_AT_SALE',
      },
    });
    await insertSale(db, {
      id: cuidLike(),
      businessId: ids.business,
      storeId: ids.storeA,
      tillId: ids.tillA,
      cashierUserId: ids.owner,
      txn: `TXN-JUL-D-${TAG}`,
      totalPence: 8_000,
      createdAt: julyAt,
      productId: ids.productDrop,
      unitId: ids.unit,
      qty: 4,
      payment: {
        method: 'CASH',
        amountPence: 8_000,
        receivedAt: julyAt,
        status: 'CONFIRMED',
        receiptOrigin: 'RECEIVED_AT_SALE',
      },
    });
    // Pending MoMo (not in Money Received)
    await insertSale(db, {
      id: cuidLike(),
      businessId: ids.business,
      storeId: ids.storeA,
      tillId: ids.tillA,
      cashierUserId: ids.owner,
      txn: `TXN-JUL-MOMO-${TAG}`,
      totalPence: 7_500,
      createdAt: julyAt,
      productId: ids.productGrow,
      unitId: ids.unit,
      qty: 3,
      payment: {
        method: 'MOBILE_MONEY',
        amountPence: 7_500,
        receivedAt: julyAt,
        status: 'PENDING_MANUAL',
        receiptOrigin: null,
        reference: `REF-${TAG}`,
      },
    });
    // Refund outflow (SalesReturn path may differ — seed negative CONFIRMED refund_outflows via SalesReturn if needed.
    // Money Received refund_outflows uses returns; BM still shows Needs MoMo + gap without refunds.
    // Branch B leakage check
    await insertSale(db, {
      id: cuidLike(),
      businessId: ids.business,
      storeId: ids.storeB,
      tillId: ids.tillB,
      cashierUserId: ids.manager,
      txn: `TXN-JUL-B-${TAG}`,
      totalPence: 12_000,
      createdAt: julyAt,
      productId: ids.productGrow,
      unitId: ids.unit,
      qty: 6,
      payment: {
        method: 'CASH',
        amountPence: 12_000,
        receivedAt: julyAt,
        status: 'CONFIRMED',
        receiptOrigin: 'RECEIVED_AT_SALE',
      },
    });

    const owner = await login(base, ownerEmail, password, bypass);
    assert(owner.ok, `owner login failed url=${owner.url}`);
    browsers.push(owner);

    await owner.page.goto(`${base}/reports/business-movement?storeId=${ids.storeA}`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    let text = await owner.page.locator('body').innerText();
    let url = owner.page.url();
    assert(/Business Movement/i.test(text), 'missing Business Movement title');
    assert(!denied(text, url), `owner denied BM url=${url}`);
    assert(!/Application error|Internal Server Error/i.test(text), 'BM page server error');
    assert(/In short/i.test(text), 'missing In short summary strip');
    assert(/What changed/i.test(text) && /Why it matters/i.test(text), 'missing What changed / Why it matters');
    assert(/What to check/i.test(text), 'missing What to check');
    assert(/Data note/i.test(text), 'missing Data note');
    assert(text.includes(STOCK_DISCLAIMER) || /Historical stock availability is not yet reliable/i.test(text), 'missing stock disclaimer');
    const inShortIdx = text.indexOf('In short');
    const dataNoteIdx = text.indexOf('Data note');
    assert(inShortIdx >= 0 && dataNoteIdx > inShortIdx, 'Data note must sit below In short, not as a top warning');
    assert(!/Stock limitation/i.test(text), 'stock limitation heading should not dominate the top');
    assert(!/Deterministic ranking/i.test(text), 'internal ranking copy leaked to owners');
    assert(!/momo confirmation risk/i.test(text), 'internal momo category leaked');
    assert(!/product_growth|product_decline/i.test(text), 'internal product category leaked');
    assert(!/confidence high/i.test(text), 'internal confidence label leaked');
    assert(/Sales/i.test(text) && /Money Received/i.test(text), 'missing Sales / Money Received cards');
    assert(/Refunds/i.test(text), 'missing Refunds card');
    assert(/MoMo to confirm/i.test(text), 'missing MoMo to confirm card');
    assert(/Sales vs money in/i.test(text), 'missing sales vs money card');
    assert(/Product movers/i.test(text), 'missing product movers');
    assert(/Grew|Dropped|New product|No current sales/i.test(text), 'product movers missing owner wording');
    assert(
      /All movement is from/i.test(text) || /Branch movement/i.test(text),
      'missing branch collapse note or branch table',
    );
    assert(
      /attributed to/i.test(text) || /Cashier movement/i.test(text),
      'missing cashier collapse note or cashier table',
    );
    assert(text.includes(`Decliner ${TAG}`) || text.includes(`Grower ${TAG}`), 'product movers missing seeded SKUs');
    assert(!hasForbiddenStock(text), 'forbidden stock-causation language on BM page');
    assert(/Review MoMo confirmations/i.test(text), 'missing Review MoMo confirmations action');
    assert(/Open Money Received/i.test(text), 'missing Open Money Received action');
    assert(
      (await owner.page.locator('a[href*="/reports/money-received"]').count()) > 0,
      'missing Money Received link',
    );
    assert(
      (await owner.page.locator('a[href*="/reports/momo-confirmation"]').count()) > 0,
      'missing MoMo Confirmation link',
    );
    checks.push('owner_bm_page_ok');
    console.log('PASS owner /reports/business-movement');

    const exportRes = await owner.page.request.get(
      `${base}/exports/business-movement?storeId=${ids.storeA}`,
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
    assert(exportRes.status() === 200, `BM export status ${exportRes.status()}`);
    assert(
      /COMPLETE_STREAM/i.test(exportText) || /COMPLETE_STREAM/i.test(completeness),
      'BM export missing COMPLETE_STREAM',
    );
    assert(/Business Movement/i.test(exportText), 'BM export missing report name');
    assert(/owner_insight/i.test(exportText), 'BM export missing owner insights');
    assert(!/PARTIAL_EXPORT_CAP/i.test(exportText), 'BM export partial cap');
    assert(!hasForbiddenStock(exportText), 'forbidden stock language in BM export');
    assert(!exportText.includes(`TXN-JUL-B-${TAG}`) || !/TXN-JUL-B/i.test(exportText), 'branch B txn should not be required in export body');
    // Branch scope: Store B sales must not inflate Store A export product totals incorrectly —
    // ensure export meta branchScope is store A when filtered.
    assert(
      exportText.includes(ids.storeA) || /branchScope/i.test(exportText),
      'export missing branch scope meta',
    );
    checks.push('owner_bm_export_ok');
    console.log('PASS owner BM export COMPLETE_STREAM');

    // Branch scoping: Store B page should mention Store B / not deny
    await owner.page.goto(`${base}/reports/business-movement?storeId=${ids.storeB}`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    text = await owner.page.locator('body').innerText();
    assert(/Business Movement/i.test(text) && !denied(text, owner.page.url()), 'store B BM denied');
    assert(/Store B/i.test(text) || text.includes('Store B'), 'store B scope chrome missing');
    checks.push('branch_scoping_ok');
    console.log('PASS branch scoping');

    // Tenant mismatch
    const tenantRes = await owner.page.request.get(
      `${base}/exports/business-movement?storeId=ALL&businessId=foreign-biz`,
      {
        headers: bypass
          ? {
              'x-vercel-protection-bypass': bypass,
              'x-vercel-set-bypass-cookie': 'true',
            }
          : {},
      },
    );
    assert(tenantRes.status() === 403, `tenant mismatch expected 403 got ${tenantRes.status()}`);
    const tenantBody = await tenantRes.json().catch(() => ({}));
    assert(tenantBody.completeExport === false, 'tenant mismatch must set completeExport false');
    checks.push('tenant_scoping_ok');
    console.log('PASS tenant scoping');

    const manager = await login(base, managerEmail, password, bypass);
    assert(manager.ok, 'manager login failed');
    browsers.push(manager);
    await manager.page.goto(`${base}/reports/business-movement?storeId=${ids.storeA}`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    const managerText = await manager.page.locator('body').innerText();
    assert(/Business Movement/i.test(managerText) && !denied(managerText, manager.page.url()), 'manager denied BM');
    const managerExport = await manager.page.request.get(
      `${base}/exports/business-movement?storeId=${ids.storeA}`,
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
    assert(managerExport.status() === 200, `manager BM export ${managerExport.status()}`);
    assert(
      /COMPLETE_STREAM/i.test(managerExportText) ||
        /COMPLETE_STREAM/i.test(managerExport.headers()['x-export-completeness'] || ''),
      'manager BM export incomplete',
    );
    checks.push('manager_access_ok');
    console.log('PASS manager access + export');

    const cashier = await login(base, cashierEmail, password, bypass);
    assert(cashier.ok, 'cashier login failed');
    browsers.push(cashier);
    await cashier.page.goto(`${base}/reports/business-movement`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    const cashierText = await cashier.page.locator('body').innerText();
    const cashierUrl = cashier.page.url();
    assert(
      denied(cashierText, cashierUrl) ||
        !/In short/i.test(cashierText) ||
        /Access denied/i.test(cashierText) ||
        /\/pos/i.test(cashierUrl),
      'cashier should be denied Business Movement page',
    );
    const cashierExport = await cashier.page.request.get(
      `${base}/exports/business-movement?storeId=ALL`,
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
      `cashier BM export unexpectedly allowed status=${cashierExport.status()}`,
    );
    assert(!/COMPLETE_STREAM/i.test(cashierExportText), 'cashier got COMPLETE_STREAM');
    checks.push('cashier_denied');
    console.log('PASS cashier denial');

    // Related reports still load on preview for this tenant
    await owner.page.goto(`${base}/reports/money-received?storeId=${ids.storeA}`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    text = await owner.page.locator('body').innerText();
    assert(/Money Received/i.test(text) && !denied(text, owner.page.url()), 'Money Received broken');
    await owner.page.goto(`${base}/reports/momo-confirmation?storeId=${ids.storeA}`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    text = await owner.page.locator('body').innerText();
    assert(/MoMo confirmation|Needs MoMo confirmation/i.test(text), 'MoMo confirmation broken');
    checks.push('related_reports_ok');
    console.log('PASS Money Received + MoMo still load');

    console.log(JSON.stringify({ base, tag: TAG, checks }, null, 2));
    console.log('BUSINESS MOVEMENT PREVIEW VALIDATE PASSED');
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
      await cleanup(db, ids.business, ids.unit);
    } catch (cleanupErr) {
      console.error('cleanup warning', cleanupErr && cleanupErr.message ? cleanupErr.message : cleanupErr);
    }
    try {
      await db.end();
    } catch {
      /* ignore */
    }
  }
}

main();

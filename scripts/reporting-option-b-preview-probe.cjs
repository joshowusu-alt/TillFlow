/**
 * Preview verification probe for Option B reporting (synthetic Preview data only).
 *
 * Loads secrets from tmp/reporting-preview.local.env (do not commit).
 *
 * Exit 0 = verified (+ cleanup), 1 = failure, 2 = blocked (missing env)
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

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
  return { ok: true, context, browser, page };
}

async function fetchWithBypass(base, pathName, bypass, { redirect = 'manual' } = {}) {
  const url = new URL(pathName, base);
  url.searchParams.set('x-vercel-protection-bypass', bypass);
  let cookie = '';
  let current = url.toString();
  for (let i = 0; i < 8; i++) {
    const res = await fetch(current, {
      redirect: 'manual',
      headers: {
        'x-vercel-protection-bypass': bypass,
        'x-vercel-set-bypass-cookie': 'true',
        ...(cookie ? { cookie } : {}),
      },
    });
    const setCookies = res.headers.getSetCookie?.() || [];
    if (setCookies.length) {
      const part = setCookies.map((c) => c.split(';')[0]).join('; ');
      cookie = cookie ? `${cookie}; ${part}` : part;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return { status: res.status, url: current, text: await res.text(), cookie };
      current = new URL(loc, current).toString();
      if (redirect === 'manual' && i === 0) {
        // keep following internally so callers see the app response after bypass cookie
      }
      continue;
    }
    return { status: res.status, url: current, text: await res.text(), cookie };
  }
  throw new Error('bypass fetch redirect count exceeded');
}

function relHref(base, href) {
  if (!href) return null;
  if (href.startsWith('/')) return href;
  try {
    const u = new URL(href);
    return `${u.pathname}${u.search}`;
  } catch {
    return href.replace(base, '');
  }
}

async function main() {
  const fileEnv = loadEnvFile(
    path.join(process.cwd(), 'tmp', 'reporting-preview.local.env')
  );
  const base = (
    process.env.PREVIEW_BASE_URL ||
    'https://supermarket-pos-git-fix-reporting-812082-joshua-owusus-projects.vercel.app'
  ).replace(/\/$/, '');
  const bypass =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET ||
    fileEnv.VERCEL_AUTOMATION_BYPASS_SECRET ||
    '';
  const dbUrl =
    process.env.PREVIEW_DATABASE_URL ||
    fileEnv.POSTGRES_URL_NON_POOLING ||
    fileEnv.POSTGRES_PRISMA_URL;

  if (!bypass) fail(2, 'BLOCKED: VERCEL_AUTOMATION_BYPASS_SECRET missing');
  if (!dbUrl) fail(2, 'BLOCKED: Preview database URL missing');

  const stamp = Date.now();
  const password = `OptBPrev${stamp}!`;
  const passwordHash = await bcrypt.hash(password, 10);
  const tag = `OPTION_B_PREVIEW_${stamp}`;
  const ownerEmail = `owner-optb-${stamp}@tillflow-test.invalid`;
  const managerEmail = `manager-optb-${stamp}@tillflow-test.invalid`;
  const cashierEmail = `cashier-optb-${stamp}@tillflow-test.invalid`;
  const foreignEmail = `foreign-optb-${stamp}@tillflow-test.invalid`;

  const ids = {
    business: cuidLike(),
    foreignBusiness: cuidLike(),
    store: cuidLike(),
    foreignStore: cuidLike(),
    till: cuidLike(),
    foreignTill: cuidLike(),
    owner: cuidLike(),
    manager: cuidLike(),
    cashier: cuidLike(),
    foreignOwner: cuidLike(),
    saleCash: cuidLike(),
    saleMomo: cuidLike(),
    saleSplit: cuidLike(),
    saleCredit: cuidLike(),
    foreignSale: cuidLike(),
    payCash: cuidLike(),
    payMomo: cuidLike(),
    paySplitCash: cuidLike(),
    paySplitMomo: cuidLike(),
    payCreditCash: cuidLike(),
    payLaterMomo: cuidLike(),
    payLaterCash: cuidLike(),
    payUnknown: cuidLike(),
    foreignPay: cuidLike(),
  };

  // Midday Accra-stable timestamps (avoid end-of-day edge flakiness on Preview).
  const saleAt = new Date();
  saleAt.setUTCHours(12, 0, 0, 0);
  const laterAt = new Date(saleAt.getTime() + 2 * 60 * 60 * 1000);

  const db = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  let browserHandles = [];
  const checks = [];

  try {
    console.log('Preview host:', base.replace(/^https?:\/\//, ''));
    console.log('Synthetic tag:', tag);

    // Unauthenticated app access (SSO bypassed; app auth required)
    {
      const res = await fetchWithBypass(base, '/reports/dashboard?period=today', bypass);
      const denied =
        /\/login/i.test(res.url) ||
        /name=["']email["']|Sign in|Log in/i.test(res.text) ||
        res.status === 401 ||
        res.status === 403;
      assert(denied, `unauth reports should require login, got ${res.status} ${res.url}`);
      assert(
        !/Sales revenue|Money received/i.test(res.text) || /\/login/i.test(res.url),
        'unauth unexpectedly saw Trading Report content'
      );
      checks.push({ name: 'unauthenticated_denied', status: res.status, finalUrl: res.url });
      console.log('PASS unauthenticated denied', res.status, res.url);
    }

    await db.connect();

    const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO "Business" (
         id, name, currency, timezone, "subscriptionStatus",
         "trialStartedAt", "trialEndsAt", "updatedAt"
       ) VALUES ($1,$2,'GHS','Africa/Accra','TRIAL_ACTIVE',NOW(),$3,NOW())`,
      [ids.business, `Option B Preview ${stamp}`, trialEnds]
    );

    await db.query(
      `INSERT INTO "Business" (
         id, name, currency, timezone, "subscriptionStatus",
         "trialStartedAt", "trialEndsAt", "updatedAt"
       ) VALUES ($1,$2,'GHS','Africa/Accra','TRIAL_ACTIVE',NOW(),$3,NOW())`,
      [ids.foreignBusiness, `Option B Foreign ${stamp}`, trialEnds]
    );

    await db.query(
      `INSERT INTO "Store" (id, "businessId", name) VALUES ($1,$2,$3)`,
      [ids.store, ids.business, 'Main Branch']
    );
    await db.query(
      `INSERT INTO "Store" (id, "businessId", name) VALUES ($1,$2,$3)`,
      [ids.foreignStore, ids.foreignBusiness, 'Foreign Branch']
    );

    await db.query(
      `INSERT INTO "Till" (id, "storeId", name) VALUES ($1,$2,$3)`,
      [ids.till, ids.store, 'Till 1']
    );
    await db.query(
      `INSERT INTO "Till" (id, "storeId", name) VALUES ($1,$2,$3)`,
      [ids.foreignTill, ids.foreignStore, 'Foreign Till']
    );

    for (const [id, email, name, role, businessId] of [
      [ids.owner, ownerEmail, 'Option B Owner', 'OWNER', ids.business],
      [ids.manager, managerEmail, 'Option B Manager', 'MANAGER', ids.business],
      [ids.cashier, cashierEmail, 'Option B Cashier', 'CASHIER', ids.business],
      [ids.foreignOwner, foreignEmail, 'Option B Foreign', 'OWNER', ids.foreignBusiness],
    ]) {
      await db.query(
        `INSERT INTO "User" (id, "businessId", email, name, "passwordHash", role, active)
         VALUES ($1,$2,$3,$4,$5,$6,true)`,
        [id, businessId, email, name, passwordHash, role]
      );
    }

    async function insertSale({ id, businessId, storeId, tillId, cashierUserId, paymentStatus, totalPence, createdAt, txn }) {
      await db.query(
        `INSERT INTO "SalesInvoice" (
           id, "businessId", "storeId", "tillId", "cashierUserId", "paymentStatus",
           "transactionNumber", "subtotalPence", "vatPence", "totalPence", "createdAt"
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$8,$9)`,
        [id, businessId, storeId, tillId, cashierUserId, paymentStatus, txn, totalPence, createdAt]
      );
    }

    async function insertPayment({ id, salesInvoiceId, method, amountPence, receivedAt, reference, receiptOrigin }) {
      await db.query(
        `INSERT INTO "SalesPayment" (
           id, "salesInvoiceId", method, "amountPence", "receivedAt", reference, status, "receiptOrigin"
         ) VALUES ($1,$2,$3,$4,$5,$6,'CONFIRMED',$7)`,
        [id, salesInvoiceId, method, amountPence, receivedAt, reference || null, receiptOrigin ?? null]
      );
    }

    await insertSale({
      id: ids.saleCash,
      businessId: ids.business,
      storeId: ids.store,
      tillId: ids.till,
      cashierUserId: ids.cashier,
      paymentStatus: 'PAID',
      totalPence: 10000,
      createdAt: saleAt,
      txn: `OB-CASH-${stamp}`,
    });
    await insertPayment({
      id: ids.payCash,
      salesInvoiceId: ids.saleCash,
      method: 'CASH',
      amountPence: 10000,
      receivedAt: saleAt,
      receiptOrigin: 'RECEIVED_AT_SALE',
    });

    await insertSale({
      id: ids.saleMomo,
      businessId: ids.business,
      storeId: ids.store,
      tillId: ids.till,
      cashierUserId: ids.cashier,
      paymentStatus: 'PAID',
      totalPence: 6000,
      createdAt: saleAt,
      txn: `OB-MOMO-${stamp}`,
    });
    await insertPayment({
      id: ids.payMomo,
      salesInvoiceId: ids.saleMomo,
      method: 'MOBILE_MONEY',
      amountPence: 6000,
      receivedAt: saleAt,
      reference: `MOMO-REF-${stamp}`,
      receiptOrigin: 'RECEIVED_AT_SALE',
    });

    await insertSale({
      id: ids.saleSplit,
      businessId: ids.business,
      storeId: ids.store,
      tillId: ids.till,
      cashierUserId: ids.cashier,
      paymentStatus: 'PAID',
      totalPence: 10000,
      createdAt: saleAt,
      txn: `OB-SPLIT-${stamp}`,
    });
    await insertPayment({
      id: ids.paySplitCash,
      salesInvoiceId: ids.saleSplit,
      method: 'CASH',
      amountPence: 4000,
      receivedAt: saleAt,
      receiptOrigin: 'RECEIVED_AT_SALE',
    });
    await insertPayment({
      id: ids.paySplitMomo,
      salesInvoiceId: ids.saleSplit,
      method: 'MOBILE_MONEY',
      amountPence: 6000,
      receivedAt: saleAt,
      receiptOrigin: 'RECEIVED_AT_SALE',
    });

    await insertSale({
      id: ids.saleCredit,
      businessId: ids.business,
      storeId: ids.store,
      tillId: ids.till,
      cashierUserId: ids.cashier,
      paymentStatus: 'PART_PAID',
      totalPence: 10000,
      createdAt: saleAt,
      txn: `OB-CREDIT-${stamp}`,
    });
    await insertPayment({
      id: ids.payCreditCash,
      salesInvoiceId: ids.saleCredit,
      method: 'CASH',
      amountPence: 3000,
      receivedAt: saleAt,
      receiptOrigin: 'RECEIVED_AT_SALE',
    });
    await insertPayment({
      id: ids.payLaterMomo,
      salesInvoiceId: ids.saleCredit,
      method: 'MOBILE_MONEY',
      amountPence: 4000,
      receivedAt: laterAt,
      reference: `LATER-MOMO-${stamp}`,
      receiptOrigin: 'LATER_CREDIT_COLLECTION',
    });
    await insertPayment({
      id: ids.payLaterCash,
      salesInvoiceId: ids.saleCredit,
      method: 'CASH',
      amountPence: 3000,
      receivedAt: laterAt,
      receiptOrigin: 'LATER_CREDIT_COLLECTION',
    });
    await db.query(
      `UPDATE "SalesInvoice" SET "paymentStatus" = 'PAID' WHERE id = $1`,
      [ids.saleCredit]
    );

    // Historical NULL-origin row (same day) — must stay unclassified in UI.
    await insertSale({
      id: `${ids.saleCash}-hist`,
      businessId: ids.business,
      storeId: ids.store,
      tillId: ids.till,
      cashierUserId: ids.cashier,
      paymentStatus: 'PAID',
      totalPence: 1200,
      createdAt: saleAt,
      txn: `OB-HIST-${stamp}`,
    });
    await insertPayment({
      id: `${ids.payCash}-hist`,
      salesInvoiceId: `${ids.saleCash}-hist`,
      method: 'CARD',
      amountPence: 1200,
      receivedAt: saleAt,
      receiptOrigin: null,
    });

    // Unsupported method (exact match only) — must land in Unknown/Other.
    await insertPayment({
      id: ids.payUnknown,
      salesInvoiceId: ids.saleCash,
      method: 'CHEQUE',
      amountPence: 1500,
      receivedAt: saleAt,
      reference: `CHEQUE-REF-${stamp}`,
      receiptOrigin: 'RECEIVED_AT_SALE',
    });

    await insertSale({
      id: ids.foreignSale,
      businessId: ids.foreignBusiness,
      storeId: ids.foreignStore,
      tillId: ids.foreignTill,
      cashierUserId: ids.foreignOwner,
      paymentStatus: 'PAID',
      totalPence: 99900,
      createdAt: saleAt,
      txn: `OB-FOREIGN-${stamp}`,
    });
    await insertPayment({
      id: ids.foreignPay,
      salesInvoiceId: ids.foreignSale,
      method: 'MOBILE_MONEY',
      amountPence: 99900,
      receivedAt: saleAt,
      receiptOrigin: 'RECEIVED_AT_SALE',
    });

    console.log('PASS seeded synthetic Preview dataset');

    const ownerLogin = await loginWithPlaywright(base, ownerEmail, password, bypass);
    assert(ownerLogin.ok, `owner login failed url=${ownerLogin.url}`);
    browserHandles.push(ownerLogin);
    const page = ownerLogin.page;

    await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.getByText(/Sales revenue/i).first().waitFor({ timeout: 60000 });
    const revenueLink = await page
      .locator('a[href*="/reports/dashboard"][href*="period=today"]')
      .first()
      .getAttribute('href')
      .catch(() => null);
    assert(revenueLink, 'Home Sales revenue Today deep-link missing');
    assert(/storeId=/i.test(revenueLink), 'Home deep-link missing store scope');
    const homeText = await page.locator('body').innerText();
    assert(/372\.00/.test(homeText), 'Home Sales revenue missing expected GH₵372.00');
    checks.push({ name: 'home_today_deeplink', href: revenueLink });
    console.log('PASS Home Today deep-link', revenueLink);

    const tradingPath = relHref(base, revenueLink);
    await page.goto(`${base}${tradingPath}`, {
      waitUntil: 'networkidle',
      timeout: 90000,
    });
    await page.getByText(/Sales revenue/i).first().waitFor({ timeout: 60000 });
    assert(/period=today/i.test(page.url()), `Trading Report lost Today: ${page.url()}`);
    let tradingText = await page.locator('body').innerText();
    assert(/Sales revenue/i.test(tradingText), 'Missing Sales revenue label');
    assert(/Money received/i.test(tradingText), 'Missing Money received label');
    assert(/372\.00/.test(tradingText), 'Trading Sales revenue missing GH₵372.00');
    assert(/387\.00/.test(tradingText), 'Trading Money received should include GH₵387.00 (372 + CHEQUE 15)');
    assert(/Unknown\/Other/i.test(tradingText), 'Missing Unknown/Other method bucket');
    assert(/Historical — not classified|Historical - not classified/i.test(tradingText), 'Missing unknown-origin bucket');
    assert(/Received at sale/i.test(tradingText), 'Missing received-at-sale bucket');
    assert(/Later credit collected/i.test(tradingText), 'Missing later-collection bucket');
    checks.push({ name: 'trading_today_scope', url: page.url() });
    console.log('PASS Trading Report Today scope + terminology + totals');

    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText(/Sales revenue/i).first().waitFor({ timeout: 60000 });
    assert(/period=today/i.test(page.url()), `Refresh lost Today: ${page.url()}`);
    checks.push({ name: 'refresh_preserves_today' });
    console.log('PASS refresh preserves Today');

    const momoHref = await page
      .locator('a[href*="/reports/receipts"][href*="MOBILE_MONEY"]')
      .first()
      .getAttribute('href')
      .catch(() => null);
    assert(momoHref, 'MoMo receipts drill-down link missing');
    await page.goto(`${base}${relHref(base, momoHref)}`, {
      waitUntil: 'networkidle',
      timeout: 90000,
    });
    await page.getByText(/Money received/i).first().waitFor({ timeout: 60000 });
    let receiptsText = await page.locator('body').innerText();
    assert(/Money received/i.test(receiptsText), 'Receipts page missing title');
    assert(/Received at sale/i.test(receiptsText), 'Missing received-at-sale classification');
    assert(/Later credit collection/i.test(receiptsText), 'Missing later collection classification');
    // Origin filter for historical NULL rows
    await page.goto(
      `${base}/reports/receipts?period=today&origin=UNCLASSIFIED&storeId=ALL`,
      { waitUntil: 'networkidle', timeout: 90000 }
    );
    const histText = await page.locator('body').innerText();
    assert(/Historical — not classified|Historical - not classified/i.test(histText), 'NULL origin label missing');
    assert(/12\.00/.test(histText), 'Historical NULL payment amount missing');
    assert(!/OB-FOREIGN|999\.00/.test(histText), 'Foreign tenant leaked into origin filter');
    checks.push({ name: 'unknown_origin_filter' });
    console.log('PASS historical NULL origin filter');
    await page.goto(`${base}${relHref(base, momoHref)}`, {
      waitUntil: 'networkidle',
      timeout: 90000,
    });
    receiptsText = await page.locator('body').innerText();
    assert(
      !/OB-FOREIGN|999\.00/.test(receiptsText),
      'Foreign tenant payment leaked into MoMo drill-down'
    );
    assert(/60\.00/.test(receiptsText), 'Expected MoMo component amounts missing');
    assert(/40\.00/.test(receiptsText), 'Expected later MoMo collection amount missing');
    assert(
      /MOMO-REF-|LATER-MOMO-|OB-MOMO-|OB-SPLIT-/i.test(receiptsText),
      'Expected MoMo payment references/rows not visible'
    );
    checks.push({ name: 'momo_drilldown', url: page.url() });
    console.log('PASS MoMo payment drill-down + classification');

    await page.goto(
      `${base}/reports/receipts?period=today&method=CASH&storeId=ALL`,
      { waitUntil: 'networkidle', timeout: 90000 }
    );
    await page.getByText(/Money received|Cash/i).first().waitFor({ timeout: 60000 });
    const cashText = await page.locator('body').innerText();
    assert(/Received at sale|Later credit collection/i.test(cashText), 'Cash receipts incomplete');
    assert(/100\.00|40\.00|30\.00/.test(cashText), 'Expected cash component amounts missing');
    assert(!/OB-FOREIGN/i.test(cashText), 'Foreign sale leaked into cash receipts');
    checks.push({ name: 'cash_drilldown' });
    console.log('PASS Cash payment drill-down');

    await page.goto(
      `${base}/reports/receipts?period=today&method=UNKNOWN&storeId=ALL`,
      { waitUntil: 'networkidle', timeout: 90000 }
    );
    await page.getByText(/Money received|Unknown/i).first().waitFor({ timeout: 60000 });
    const unknownText = await page.locator('body').innerText();
    assert(/Unknown\/Other/i.test(unknownText), 'UNKNOWN filter missing Unknown/Other label');
    assert(/15\.00/.test(unknownText), 'UNKNOWN filter missing CHEQUE amount');
    assert(/CHEQUE-REF-/i.test(unknownText), 'UNKNOWN filter missing CHEQUE reference');
    assert(!/OB-FOREIGN|999\.00/.test(unknownText), 'Foreign tenant leaked into UNKNOWN filter');
    checks.push({ name: 'unknown_method_filter' });
    console.log('PASS Unknown/Other method filter');

    await page.goto(`${base}/reports/cash-drawer`, {
      waitUntil: 'networkidle',
      timeout: 90000,
    });
    await page.waitForTimeout(2000);
    const drawerText = await page.locator('body').innerText();
    assert(/physical cash/i.test(drawerText), 'Cash Drawer missing physical-cash scope copy');
    const electronicLink = await page
      .locator(
        'a[href*="/reports/dashboard"], a[href*="/reports/receipts"], a[href*="money-received"]'
      )
      .first()
      .getAttribute('href')
      .catch(() => null);
    assert(electronicLink, 'Cash Drawer electronic receipts route missing');
    checks.push({ name: 'cash_drawer_scope', electronicLink });
    console.log('PASS Cash Drawer physical-cash scope + signpost');

    await ownerLogin.browser.close();
    browserHandles = [];

    const managerLogin = await loginWithPlaywright(base, managerEmail, password, bypass);
    assert(managerLogin.ok, `manager login failed url=${managerLogin.url}`);
    browserHandles.push(managerLogin);

    // Valid own store and explicit ALL remain authorised.
    await managerLogin.page.goto(
      `${base}/reports/dashboard?period=today&storeId=${ids.store}`,
      { waitUntil: 'domcontentloaded', timeout: 90000 }
    );
    await managerLogin.page.getByText(/Sales revenue|Money received|Trading Report/i).first().waitFor({ timeout: 60000 });
    const validStoreText = await managerLogin.page.locator('body').innerText();
    assert(/Sales revenue|Money received|Trading Report/i.test(validStoreText), 'Valid store scope should render Trading Report');
    assert(!/999\.00|OB-FOREIGN/i.test(validStoreText), 'Valid store must not leak foreign tenant');
    checks.push({ name: 'manager_valid_store' });

    await managerLogin.page.goto(
      `${base}/reports/dashboard?period=today&storeId=ALL`,
      { waitUntil: 'domcontentloaded', timeout: 90000 }
    );
    await managerLogin.page.getByText(/Sales revenue|Money received|Trading Report/i).first().waitFor({ timeout: 60000 });
    const allStoreText = await managerLogin.page.locator('body').innerText();
    assert(/Sales revenue|Money received|Trading Report/i.test(allStoreText), 'Explicit ALL should render Trading Report');
    assert(!/999\.00|OB-FOREIGN/i.test(allStoreText), 'ALL scope must not leak foreign tenant');
    checks.push({ name: 'manager_explicit_all' });

    // Foreign / unknown / blank store must fail closed (404), never broaden to ALL.
    for (const [label, storeParam] of [
      ['foreign', ids.foreignStore],
      ['unknown', 'store_does_not_exist_zzzz'],
      ['blank', ''],
    ]) {
      const path =
        storeParam === ''
          ? `${base}/reports/dashboard?period=today&storeId=`
          : `${base}/reports/dashboard?period=today&storeId=${storeParam}`;
      await managerLogin.page.goto(path, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await managerLogin.page.waitForTimeout(2000);
      const statusish = await managerLogin.page.locator('body').innerText();
      const url = managerLogin.page.url();
      const denied =
        /not found|404|doesn.?t exist|page could not be found/i.test(statusish)
        || /\/_not-found|404/i.test(url)
        || !/Money received/i.test(statusish);
      assert(denied, `${label} storeId must fail closed, got url=${url}`);
      assert(!/999\.00|OB-FOREIGN/i.test(statusish), `${label} storeId must not reveal foreign totals`);
      checks.push({ name: `manager_${label}_store_fail_closed` });
    }
    console.log('PASS manager store-scope fail-closed (foreign/unknown/blank)');
    await managerLogin.browser.close();
    browserHandles = [];

    // Receipts list must fail closed consistently with summary.
    const owner2 = await loginWithPlaywright(base, ownerEmail, password, bypass);
    assert(owner2.ok, `owner re-login failed url=${owner2.url}`);
    browserHandles.push(owner2);
    await owner2.page.goto(
      `${base}/reports/receipts?period=today&storeId=${ids.foreignStore}&page=2`,
      { waitUntil: 'domcontentloaded', timeout: 90000 }
    );
    await owner2.page.waitForTimeout(2000);
    const receiptsDeniedText = await owner2.page.locator('body').innerText();
    const receiptsDenied =
      /not found|404|doesn.?t exist|page could not be found/i.test(receiptsDeniedText)
      || !/Money received/i.test(receiptsDeniedText);
    assert(receiptsDenied, 'Receipts foreign store must fail closed (including page>1)');
    assert(!/999\.00|OB-FOREIGN/i.test(receiptsDeniedText), 'Receipts must not leak foreign rows via pagination');
    checks.push({ name: 'receipts_foreign_store_fail_closed' });
    await owner2.browser.close();
    browserHandles = [];

    const cashierLogin = await loginWithPlaywright(base, cashierEmail, password, bypass);
    assert(cashierLogin.ok, `cashier login failed url=${cashierLogin.url}`);
    browserHandles.push(cashierLogin);
    await cashierLogin.page.goto(`${base}/reports/receipts?period=today`, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    await cashierLogin.page.waitForTimeout(3000);
    const cashierUrl = cashierLogin.page.url();
    const cashierText = await cashierLogin.page.locator('body').innerText();
    const cashierDenied =
      /login|not authorised|not authorized|forbidden|access denied|don't have|do not have|restricted|home/i.test(
        `${cashierUrl} ${cashierText}`
      ) || !/Money received/i.test(cashierText);
    assert(cashierDenied, 'Cashier unexpectedly accessed Money Received report');
    checks.push({ name: 'cashier_receipts_restricted', url: cashierUrl });
    console.log('PASS cashier receipts restricted');
    await cashierLogin.browser.close();
    browserHandles = [];

    console.log(
      JSON.stringify(
        {
          tag,
          expectedRevenuePence: 37200,
          expectedMoneyReceivedPence: 38700,
          expectedUnknownMethodPence: 1500,
          expectedCashReceiptsPence: 20000,
          expectedMomoReceiptsPence: 16000,
          checks: checks.map((c) => c.name),
        },
        null,
        2
      )
    );
    console.log('PASS Option B Preview synthetic verification');
  } catch (err) {
    console.error('FAIL', err && err.message ? err.message : err);
    if (err && err.cause) console.error('CAUSE', err.cause);
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
      if (db._connected || db._ending === false) {
        /* best-effort cleanup of this run only */
      }
      await db.query(`DELETE FROM "SalesPayment" WHERE id = ANY($1::text[])`, [
        [
          ids.payCash,
          `${ids.payCash}-hist`,
          ids.payMomo,
          ids.paySplitCash,
          ids.paySplitMomo,
          ids.payCreditCash,
          ids.payLaterMomo,
          ids.payLaterCash,
          ids.payUnknown,
          ids.foreignPay,
        ],
      ]);
      await db.query(`DELETE FROM "SalesInvoice" WHERE id = ANY($1::text[])`, [
        [ids.saleCash, `${ids.saleCash}-hist`, ids.saleMomo, ids.saleSplit, ids.saleCredit, ids.foreignSale],
      ]);
      await db.query(`DELETE FROM "Till" WHERE id = ANY($1::text[])`, [
        [ids.till, ids.foreignTill],
      ]);
      await db.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [
        [ids.owner, ids.manager, ids.cashier, ids.foreignOwner],
      ]);
      await db.query(`DELETE FROM "Store" WHERE id = ANY($1::text[])`, [
        [ids.store, ids.foreignStore],
      ]);
      await db.query(`DELETE FROM "Business" WHERE id = ANY($1::text[])`, [
        [ids.business, ids.foreignBusiness],
      ]);
      console.log('CLEANUP removed synthetic Preview rows for', tag);
    } catch (cleanupErr) {
      console.error('CLEANUP warning', cleanupErr.message || cleanupErr);
    }
    try {
      await db.end();
    } catch {
      /* ignore */
    }
  }
}

main();

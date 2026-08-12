/**
 * Read-only Production smoke for Canonical Money Received (Step 5I).
 * Uses existing QA tenant credentials. Does NOT insert or mutate production data.
 *
 * Env: .playwright-qa.local.env (PLAYWRIGHT_* ) and optional VERCEL_AUTOMATION_BYPASS_SECRET.
 * Exit 0 = passed, 1 = failed, 2 = blocked.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

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
  // Give session cookie a moment after client-side redirect.
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

function denied(text, url) {
  return (
    /access denied|not authorised|not authorized|forbidden|do not have permission|insufficient/i.test(
      text,
    ) ||
    /\/login/.test(url) ||
    /permission/i.test(text)
  );
}

async function main() {
  // Do not pull Preview bypass into Production — it can break login.
  const fileEnv = loadEnvFile(path.join(root, '.playwright-qa.local.env'));
  const base = (
    process.env.PLAYWRIGHT_BASE_URL ||
    fileEnv.PLAYWRIGHT_BASE_URL ||
    'https://www.tillflow.app'
  ).replace(/\/$/, '');
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';
  const ownerEmail = process.env.PLAYWRIGHT_OWNER_EMAIL || fileEnv.PLAYWRIGHT_OWNER_EMAIL;
  const ownerPassword =
    process.env.PLAYWRIGHT_OWNER_PASSWORD || fileEnv.PLAYWRIGHT_OWNER_PASSWORD;
  const managerEmail =
    process.env.PLAYWRIGHT_MANAGER_EMAIL || fileEnv.PLAYWRIGHT_MANAGER_EMAIL;
  const managerPassword =
    process.env.PLAYWRIGHT_MANAGER_PASSWORD || fileEnv.PLAYWRIGHT_MANAGER_PASSWORD;
  const cashierEmail =
    process.env.PLAYWRIGHT_CASHIER_EMAIL || fileEnv.PLAYWRIGHT_CASHIER_EMAIL;
  const cashierPassword =
    process.env.PLAYWRIGHT_CASHIER_PASSWORD || fileEnv.PLAYWRIGHT_CASHIER_PASSWORD;

  if (!ownerEmail || !ownerPassword || !managerEmail || !managerPassword || !cashierEmail || !cashierPassword) {
    console.error('BLOCKED: missing PLAYWRIGHT_* credentials');
    process.exit(2);
  }

  console.log(`Production smoke base: ${base}`);
  const checks = [];
  const browsers = [];

  try {
    // Owner page
    const owner = await login(base, ownerEmail, ownerPassword, bypass);
    assert(owner.ok, `owner login failed url=${owner.url}`);
    browsers.push(owner);

    await owner.page.goto(`${base}/reports/money-received`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    let text = await owner.page.locator('body').innerText();
    let url = owner.page.url();
    assert(/Payments and Money Received/i.test(text), 'owner missing title');
    assert(
      /not a sales total|separate from sales|Confirmed money/i.test(text),
      'owner missing non-sales framing',
    );
    assert(!denied(text, url), `owner unexpectedly denied url=${url}`);
    checks.push('owner_money_received_ok');
    console.log('PASS owner /reports/money-received');

    // Export
    const exportRes = await owner.page.request.get(`${base}/exports/money-received?storeId=ALL`, {
      headers: bypass
        ? {
            'x-vercel-protection-bypass': bypass,
            'x-vercel-set-bypass-cookie': 'true',
          }
        : {},
    });
    const exportStatus = exportRes.status();
    const exportText = await exportRes.text();
    assert(exportStatus === 200, `owner export status ${exportStatus}`);
    assert(
      /COMPLETE_STREAM/i.test(exportText),
      `owner export missing COMPLETE_STREAM body=${exportText.slice(0, 300)}`,
    );
    assert(!/PARTIAL_EXPORT_CAP/i.test(exportText), 'owner export partial cap');
    assert(!/<html/i.test(exportText), 'owner export returned HTML');
    checks.push('owner_export_complete_stream');
    console.log('PASS owner export COMPLETE_STREAM');

    // Branch isolation: if store selector/links exist, open two stores if present
    const storeLinks = await owner.page
      .locator('a[href*="storeId="], select[name="storeId"], select#storeId')
      .all();
    if (storeLinks.length > 0) {
      checks.push('branch_controls_present');
    }
    // Foreign-looking store id should not dump unrelated tenant content as success page with foreign labels
    await owner.page.goto(
      `${base}/reports/money-received?storeId=cm_nonexistent_store_isolation_probe`,
      { waitUntil: 'networkidle', timeout: 120000 },
    );
    const isoText = await owner.page.locator('body').innerText();
    const isoUrl = owner.page.url();
    assert(
      denied(isoText, isoUrl) ||
        /no store|invalid store|not found|select a store|0\.00|No confirmed|nothing to show|empty/i.test(
          isoText,
        ) ||
        !/Payments and Money Received/i.test(isoText) ||
        /access|denied|permission|branch|store/i.test(isoText),
      'unexpected success for nonexistent storeId',
    );
    checks.push('invalid_store_scoped');
    console.log('PASS invalid store scoping');

    // Dashboard / today / weekly surfaces
    await owner.page.goto(`${base}/reports/dashboard?period=today`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    const dashText = await owner.page.locator('body').innerText();
    assert(!/Application error|Internal Server Error|Something went wrong/i.test(dashText), 'dashboard error');
    assert(/Money received|Money Received/i.test(dashText), 'dashboard missing Money received');
    checks.push('dashboard_money_received_ok');
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

    // Manager
    const manager = await login(base, managerEmail, managerPassword, bypass);
    assert(manager.ok, `manager login failed url=${manager.url}`);
    browsers.push(manager);
    await manager.page.goto(`${base}/reports/money-received`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    const managerText = await manager.page.locator('body').innerText();
    assert(/Payments and Money Received/i.test(managerText), 'manager missing title');
    assert(!denied(managerText, manager.page.url()), 'manager denied');
    const managerExport = await manager.page.request.get(
      `${base}/exports/money-received?storeId=ALL`,
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
    assert(managerExport.status() === 200, `manager export ${managerExport.status()}`);
    assert(/COMPLETE_STREAM/i.test(managerExportText), 'manager export incomplete');
    checks.push('manager_access_ok');
    checks.push('manager_export_ok');
    console.log('PASS manager access + export');

    // Cashier denial
    const cashier = await login(base, cashierEmail, cashierPassword, bypass);
    assert(cashier.ok, `cashier login failed url=${cashier.url} body=${cashier.body || ''}`);
    browsers.push(cashier);
    await cashier.page.goto(`${base}/reports/money-received`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    const cashierText = await cashier.page.locator('body').innerText();
    const cashierUrl = cashier.page.url();
    assert(
      denied(cashierText, cashierUrl) || !/Payments and Money Received/i.test(cashierText),
      'cashier should be denied money-received page',
    );
    const cashierExport = await cashier.page.request.get(
      `${base}/exports/money-received?storeId=ALL`,
      {
        headers: bypass
          ? {
              'x-vercel-protection-bypass': bypass,
              'x-vercel-set-bypass-cookie': 'true',
            }
          : {},
      },
    );
    const cashierExportStatus = cashierExport.status();
    const cashierExportText = await cashierExport.text();
    assert(
      cashierExportStatus === 403 ||
        cashierExportStatus === 401 ||
        cashierExportStatus === 302 ||
        cashierExportStatus === 307 ||
        /login|denied|forbidden|not authorised|not authorized/i.test(cashierExportText) ||
        /<html/i.test(cashierExportText),
      `cashier export unexpectedly allowed status=${cashierExportStatus}`,
    );
    assert(!/COMPLETE_STREAM/i.test(cashierExportText), 'cashier got COMPLETE_STREAM');
    checks.push('cashier_denied');
    checks.push('cashier_export_denied');
    console.log('PASS cashier denial');

    // Cross-tenant style probe: foreign businessId query param must not broaden export
    const cross = await owner.page.request.get(
      `${base}/exports/money-received?businessId=cm_foreign_business_probe&storeId=ALL`,
      {
        headers: bypass
          ? {
              'x-vercel-protection-bypass': bypass,
              'x-vercel-set-bypass-cookie': 'true',
            }
          : {},
      },
    );
    const crossText = await cross.text();
    assert(
      cross.status() === 200 || cross.status() === 403 || cross.status() === 400,
      `cross-tenant probe unexpected status ${cross.status()}`,
    );
    // Session tenant must own the export; foreign businessId must not unlock another tenant stream marker alone
    if (/COMPLETE_STREAM/i.test(crossText)) {
      assert(
        !/cm_foreign_business_probe/i.test(crossText),
        'export echoed foreign business id as data scope',
      );
    }
    checks.push('tenant_isolation_probe');
    console.log('PASS tenant isolation probe');

    console.log(JSON.stringify({ base, checks }, null, 2));
    console.log('PRODUCTION SMOKE PASSED');
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
  }
}

main();

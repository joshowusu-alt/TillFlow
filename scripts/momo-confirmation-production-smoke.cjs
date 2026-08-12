/**
 * Read-only Production smoke for MoMo Confirmation Review (Step 5N).
 * Uses existing QA tenant credentials. Does NOT insert or mutate production data.
 *
 * Env: .playwright-qa.local.env (PLAYWRIGHT_*) and optional VERCEL_AUTOMATION_BYPASS_SECRET
 *      (Production only — do not load Preview bypass).
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
  const sessionCookies = cookies.filter((c) => c.name.startsWith('pos_session'));
  if (sessionCookies.length === 0) {
    const url = page.url();
    const body = await page.locator('body').innerText().catch(() => '');
    await browser.close();
    return { ok: false, url, body: body.slice(0, 400) };
  }
  return { ok: true, context, browser, page };
}

async function main() {
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

  if (
    !ownerEmail ||
    !ownerPassword ||
    !managerEmail ||
    !managerPassword ||
    !cashierEmail ||
    !cashierPassword
  ) {
    console.error('BLOCKED: missing PLAYWRIGHT_* credentials');
    process.exit(2);
  }

  console.log(`Production MoMo smoke base: ${base}`);
  const checks = [];
  const browsers = [];

  try {
    const owner = await login(base, ownerEmail, ownerPassword, bypass);
    assert(owner.ok, `owner login failed url=${owner.url}`);
    browsers.push(owner);

    await owner.page.goto(`${base}/reports/momo-confirmation`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    let text = await owner.page.locator('body').innerText();
    let url = owner.page.url();
    assert(/MoMo confirmation|Needs MoMo confirmation/i.test(text), 'owner missing MoMo confirmation page');
    assert(!denied(text, url), `owner unexpectedly denied MoMo url=${url}`);
    assert(!/Application error|Internal Server Error/i.test(text), 'momo page server error');
    checks.push('owner_momo_page_ok');
    console.log('PASS owner /reports/momo-confirmation');

    const exportRes = await owner.page.request.get(`${base}/exports/momo-confirmation?storeId=ALL`, {
      headers: bypass
        ? {
            'x-vercel-protection-bypass': bypass,
            'x-vercel-set-bypass-cookie': 'true',
          }
        : {},
    });
    const exportText = await exportRes.text();
    const completeness = exportRes.headers()['x-export-completeness'] || '';
    assert(exportRes.status() === 200, `owner momo export status ${exportRes.status()}`);
    assert(
      /COMPLETE_STREAM/i.test(exportText) || /COMPLETE_STREAM/i.test(completeness),
      `owner momo export missing COMPLETE_STREAM body=${exportText.slice(0, 300)}`,
    );
    assert(!/PARTIAL_EXPORT_CAP/i.test(exportText), 'owner momo export partial cap');
    assert(!/<html/i.test(exportText), 'owner momo export returned HTML');
    checks.push('owner_momo_export_complete_stream');
    console.log('PASS owner MoMo export COMPLETE_STREAM');

    await owner.page.goto(`${base}/reports/money-received`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    text = await owner.page.locator('body').innerText();
    assert(/Money Received/i.test(text), 'owner missing Money Received title');
    assert(/Needs MoMo confirmation/i.test(text), 'owner missing Needs MoMo confirmation copy');
    const momoLinkCount = await owner.page.locator('a[href*="/reports/momo-confirmation"]').count();
    assert(
      momoLinkCount > 0 || /Review MoMo confirmations/i.test(text),
      'Money Received missing MoMo review link',
    );
    assert(!denied(text, owner.page.url()), 'owner denied Money Received');
    checks.push('money_received_link_copy_ok');
    console.log('PASS Money Received link/card/copy');

    await owner.page.goto(`${base}/reports/dashboard?period=today`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    const dashText = await owner.page.locator('body').innerText();
    assert(!/Application error|Internal Server Error|Something went wrong/i.test(dashText), 'dashboard error');
    assert(/Money received|Money Received/i.test(dashText), 'dashboard missing Money received');
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
    const managerExport = await manager.page.request.get(
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
    const managerExportText = await managerExport.text();
    assert(managerExport.status() === 200, `manager momo export ${managerExport.status()}`);
    assert(
      /COMPLETE_STREAM/i.test(managerExportText) ||
        /COMPLETE_STREAM/i.test(managerExport.headers()['x-export-completeness'] || ''),
      'manager momo export incomplete',
    );
    checks.push('manager_access_ok');
    checks.push('manager_export_ok');
    console.log('PASS manager access + export');

    const cashier = await login(base, cashierEmail, cashierPassword, bypass);
    assert(cashier.ok, `cashier login failed url=${cashier.url} body=${cashier.body || ''}`);
    browsers.push(cashier);
    await cashier.page.goto(`${base}/reports/momo-confirmation`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    const cashierText = await cashier.page.locator('body').innerText();
    const cashierUrl = cashier.page.url();
    assert(
      denied(cashierText, cashierUrl) ||
        !/Needs MoMo confirmation/i.test(cashierText) ||
        /Access denied/i.test(cashierText),
      'cashier should be denied MoMo confirmation page',
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
    checks.push('cashier_export_denied');
    console.log('PASS cashier denial');

    console.log(JSON.stringify({ base, checks }, null, 2));
    console.log('MOMO CONFIRMATION PRODUCTION SMOKE PASSED');
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

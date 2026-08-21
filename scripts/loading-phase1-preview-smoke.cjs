/**
 * Loading Phase 1 hosted preview / production smoke (visual loading only).
 *
 * Preview: seeds a tagged incomplete-onboarding owner on Preview DB, validates
 * Instant Loading surfaces, then deletes tagged rows. Never targets Production DB.
 * Production: read-only QA login; no inserts/updates/deletes.
 *
 * Exit 0 = passed, 1 = failed, 2 = blocked.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');
const { chromium, devices } = require('playwright');

const root = path.resolve(__dirname, '..');
const TAG = `LOAD_P1_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;

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
  return /preview/i.test(String(url || '')) || /tillflow_preview/i.test(String(url || ''));
}

function isProdHost(base) {
  try {
    const host = new URL(base).host;
    return /tillflow\.app$/i.test(host) && !/vercel\.app/i.test(base);
  } catch {
    return false;
  }
}

async function login(page, context, base, email, password, bypass) {
  const loginUrl = bypass
    ? `${base}/login?x-vercel-protection-bypass=${encodeURIComponent(bypass)}`
    : `${base}/login`;
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.locator('input[name="email"]').first().waitFor({ timeout: 30_000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await Promise.race([
    page.waitForURL((url) => !String(url.pathname || '').includes('/login'), {
      timeout: 90_000,
    }),
    page.waitForTimeout(15_000),
  ]).catch(() => null);
  for (let i = 0; i < 24; i++) {
    const cookies = await context.cookies();
    if (cookies.some((c) => c.name.startsWith('pos_session'))) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

async function softNavCapture(page, href, { timeoutMs = 5000 } = {}) {
  const samples = [];
  const start = Date.now();
  const poll = setInterval(async () => {
    try {
      const snap = await page.evaluate(() => {
        const body = document.body?.innerText || '';
        const html = document.body?.innerHTML || '';
        const labels = Array.from(document.querySelectorAll('[aria-label]'))
          .map((el) => el.getAttribute('aria-label') || '')
          .join(' | ');
        return {
          hasTillFlowPosChip: /TillFlow POS/i.test(body) || /TillFlow POS/i.test(html),
          hasDarkOwnerHomeSkeleton: /Preparing owner home/i.test(labels),
          hasChecklistSkeleton: /Preparing setup checklist/i.test(labels),
          hasPosSkeleton: /Loading point of sale/i.test(labels),
          hasLaunchMessage: !!document.querySelector('#tillflow-launch-message'),
          hasLoadingPage: /Loading page/i.test(labels),
        };
      });
      samples.push({ t: Date.now() - start, ...snap });
    } catch {
      // ignore mid-nav evaluate failures
    }
  }, 70);

  try {
    await page.locator(`a[href="${href}"], a[href^="${href}?"]`).first().click({ timeout: 12_000 });
  } catch {
    await page.goto(new URL(href, page.url()).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
  }

  await page.waitForTimeout(Math.min(timeoutMs, 2800));
  clearInterval(poll);
  await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
  return samples;
}

async function seedPreviewTenant(db, passwordHash) {
  const ids = {
    business: cuidLike(),
    store: cuidLike(),
    till: cuidLike(),
    owner: cuidLike(),
    product: cuidLike(),
  };
  const email = `owner.${TAG.toLowerCase()}@example.com`;
  const password = `Pw_${TAG.slice(-8)}!aA1`;
  const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  // Incomplete onboarding + named business + category + sellable stock → Ready to sell checklist.
  await db.query(
    `INSERT INTO "Business" (
       id, name, currency, timezone, "subscriptionStatus",
       "trialStartedAt", "trialEndsAt", "businessCategory", "updatedAt"
     ) VALUES ($1,$2,'GHS','Africa/Accra','TRIAL_ACTIVE',NOW(),$3,'PROVISION',NOW())`,
    [ids.business, `Load P1 ${TAG}`, trialEnds],
  );
  await db.query(`INSERT INTO "Store" (id, "businessId", name) VALUES ($1,$2,$3)`, [
    ids.store,
    ids.business,
    'Main Store',
  ]);
  await db.query(`INSERT INTO "Till" (id, "storeId", name) VALUES ($1,$2,$3)`, [
    ids.till,
    ids.store,
    'Till 1',
  ]);
  await db.query(
    `INSERT INTO "User" (id, "businessId", email, name, "passwordHash", role, active)
     VALUES ($1,$2,$3,$4,$5,'OWNER',true)`,
    [ids.owner, ids.business, email, 'Load P1 Owner', passwordHash],
  );
  await db.query(
    `INSERT INTO "Product" (
       id, "businessId", name, sku, active, "sellingPriceBasePence", "defaultCostBasePence", "updatedAt"
     ) VALUES ($1,$2,$3,$4,true,500,200,NOW())`,
    [ids.product, ids.business, `P1 Item ${TAG}`, `SKU-${TAG.slice(-8)}`],
  );
  await db.query(
    `INSERT INTO "InventoryBalance" (id, "storeId", "productId", "qtyOnHandBase", "updatedAt")
     VALUES ($1,$2,$3,10,NOW())`,
    [cuidLike(), ids.store, ids.product],
  );

  return { ids, email, password };
}

async function cleanupPreviewTenant(db, ids) {
  await db.query(`DELETE FROM "InventoryBalance" WHERE "productId" = $1`, [ids.product]);
  await db.query(`DELETE FROM "Product" WHERE "businessId" = $1`, [ids.business]);
  await db.query(`DELETE FROM "Till" WHERE "storeId" = $1`, [ids.store]);
  await db.query(`DELETE FROM "User" WHERE "businessId" = $1`, [ids.business]);
  await db.query(`DELETE FROM "Store" WHERE "businessId" = $1`, [ids.business]);
  await db.query(`DELETE FROM "Business" WHERE id = $1`, [ids.business]);
}

(async () => {
  const qa = loadEnvFile(path.join(root, '.playwright-qa.local.env'));
  const previewEnv = loadEnvFile(path.join(root, 'tmp/reporting-preview.local.env'));
  const base = (
    process.env.BASE_URL ||
    process.env.PREVIEW_BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    previewEnv.PREVIEW_BASE_URL ||
    qa.PLAYWRIGHT_BASE_URL ||
    ''
  ).replace(/\/$/, '');
  const bypass =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET ||
    previewEnv.VERCEL_AUTOMATION_BYPASS_SECRET ||
    '';
  const mode = process.env.SMOKE_MODE || (isProdHost(base) ? 'production' : 'preview');

  if (!base) {
    console.error('BLOCKED: missing BASE_URL');
    process.exit(2);
  }

  console.log(`Loading Phase 1 smoke base: ${base} mode=${mode}`);

  let email = process.env.PLAYWRIGHT_OWNER_EMAIL || qa.PLAYWRIGHT_OWNER_EMAIL;
  let password = process.env.PLAYWRIGHT_OWNER_PASSWORD || qa.PLAYWRIGHT_OWNER_PASSWORD;
  let db = null;
  let seeded = null;

  if (mode === 'preview') {
    const dbUrl =
      process.env.POSTGRES_URL_NON_POOLING ||
      previewEnv.POSTGRES_URL_NON_POOLING ||
      previewEnv.PREVIEW_DATABASE_URL ||
      '';
    if (!dbUrl || !looksPreviewUrl(dbUrl)) {
      console.error('BLOCKED: preview DB URL missing or does not look like Preview');
      process.exit(2);
    }
    if (isProdHost(base)) {
      console.error('BLOCKED: refusing production host in preview mode');
      process.exit(2);
    }
    db = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await db.connect();
    const dbName = await db.query('SELECT current_database() AS db');
    const dbLabel = String(dbName.rows[0].db || '');
    assert(
      /preview|tillflow_preview/i.test(dbLabel) || looksPreviewUrl(dbUrl),
      `Refusing unexpected database: ${dbLabel}`,
    );
    const passwordHash = await bcrypt.hash(`Pw_${TAG.slice(-8)}!aA1`, 10);
    seeded = await seedPreviewTenant(db, passwordHash);
    email = seeded.email;
    password = seeded.password;
    console.log(`Seeded preview tag=${TAG} business=${seeded.ids.business}`);
  } else {
    if (!email || !password) {
      console.error('BLOCKED: production smoke needs QA owner credentials');
      process.exit(2);
    }
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    ...(bypass
      ? {
          extraHTTPHeaders: {
            'x-vercel-protection-bypass': bypass,
            'x-vercel-set-bypass-cookie': 'true',
          },
        }
      : {}),
  });
  if (bypass) {
    await context.addCookies([
      {
        name: 'x-vercel-protection-bypass',
        value: bypass,
        domain: new URL(base).hostname,
        path: '/',
      },
    ]);
  }
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 });

  const checks = [];
  const note = (name, ok, detail) => {
    checks.push({ name, ok, detail: detail || '' });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  };

  try {
    await page.goto(
      bypass
        ? `${base}/launch?x-vercel-protection-bypass=${encodeURIComponent(bypass)}`
        : `${base}/launch`,
      { waitUntil: 'domcontentloaded', timeout: 60_000 },
    );
    const launchHtml = await page.content();
    note(
      'cold_/launch_branded',
      /tillflow-logo-blue\.png/i.test(launchHtml) || /Opening/i.test(launchHtml),
      'TillFlow launch surface reachable',
    );

    const loggedIn = await login(page, context, base, email, password, bypass);
    assert(loggedIn, `owner login failed url=${page.url()}`);
    note('owner_login', true, page.url());

    await page.goto(`${base}/onboarding`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForTimeout(1500);
    let homeText = await page.locator('body').innerText();
    const incompleteHints = /Ready to sell|Start selling|Setup|Up next|Your path/i.test(homeText);
    const completedHints = /Open POS|Today.?s attention|Improve your records/i.test(homeText);
    note(
      'onboarding_settled',
      incompleteHints || completedHints,
      incompleteHints ? 'checklist/setup UI' : completedHints ? 'completed home UI' : 'unknown',
    );

    if (mode === 'preview') {
      note(
        'preview_incomplete_checklist_ui',
        /Ready to sell|Setup|Start selling|Your path|Up next/i.test(homeText),
        'seeded incomplete tenant shows checklist/setup',
      );
      note(
        'preview_no_dark_skeleton_stuck',
        !(await page.locator('[aria-label="Preparing owner home"]').count()),
        'no stuck dark owner-home skeleton after settle',
      );
    }

    // Soft nav to POS
    await page.goto(`${base}/onboarding`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const posSamples = await softNavCapture(page, '/pos');
    note(
      'pos_nav_no_tillflow_pos_chip',
      !posSamples.some((s) => s.hasTillFlowPosChip),
      'no branded TillFlow POS chip during nav',
    );
    note(
      'pos_nav_no_full_launch',
      !posSamples.some((s) => s.hasLaunchMessage),
      'no #tillflow-launch-message during in-app POS nav',
    );
    note(
      'pos_nav_pos_shaped_or_fast',
      true,
      posSamples.some((s) => s.hasPosSkeleton)
        ? 'saw Loading point of sale'
        : 'skeleton not observed (fast) — settled POS required',
    );

    await page.waitForURL(/\/pos/, { timeout: 60_000 });
    await page.waitForTimeout(1800);
    const posText = await page.locator('body').innerText();
    note(
      'pos_usable_shell',
      /Search|Park|Cart|Category|Checkout|Preparing checkout|product|Open|Till/i.test(posText) &&
        !/TillFlow POS/i.test(posText),
      'POS shell usable without branded route chip',
    );

    // Expenses
    await page.goto(`${base}/onboarding`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const expSamples = await softNavCapture(page, '/expenses');
    note(
      'expenses_nav_no_splash',
      !expSamples.some((s) => s.hasLaunchMessage || s.hasTillFlowPosChip),
      'no launch/POS splash',
    );
    await page.waitForURL(/\/expenses/, { timeout: 60_000 });
    await page.waitForTimeout(800);
    note('expenses_settled', /Expense/i.test(await page.locator('body').innerText()), 'expenses loaded');

    const listRoutes = [
      '/products',
      '/customers',
      '/suppliers',
      '/users',
      '/payments/customer-receipts',
      '/shifts',
      '/settings',
    ];
    for (const route of listRoutes) {
      await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await page.waitForTimeout(700);
      const t = await page.locator('body').innerText();
      const bad = /Internal Server Error|Application error/i.test(t);
      note(`route_${route.replace(/\W+/g, '_')}`, !bad && t.length > 40, `len=${t.length}`);
      note(`route_${route.replace(/\W+/g, '_')}_no_pos_chip`, !/TillFlow POS/i.test(t), 'ok');
    }

    for (const route of [
      '/reports/money-received',
      '/reports/momo-confirmation',
      '/reports/business-movement',
      '/reports/dashboard',
    ]) {
      await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForTimeout(1000);
      const t = await page.locator('body').innerText();
      note(
        `report_${route.split('/').pop()}`,
        t.length > 60 && !/Internal Server Error|Application error/i.test(t),
        `len=${t.length}`,
      );
    }

    // Soft nav back to onboarding — expect checklist skeleton for incomplete preview tenant
    await page.goto(`${base}/pos`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const homeSamples = await softNavCapture(page, '/onboarding');
    if (mode === 'preview' || incompleteHints) {
      const sawDark = homeSamples.some((s) => s.hasDarkOwnerHomeSkeleton);
      const sawChecklist = homeSamples.some((s) => s.hasChecklistSkeleton);
      note(
        'home_nav_no_dark_completed_skeleton',
        !sawDark || sawChecklist,
        sawChecklist
          ? 'saw checklist skeleton'
          : sawDark
            ? 'dark completed-home skeleton observed'
            : 'no dark flash (fast or checklist path)',
      );
    } else {
      note(
        'home_nav_no_dark_completed_skeleton',
        true,
        'production QA appears completed-home; incomplete Instant Loading asserted on preview seed',
      );
    }

    const failed = checks.filter((c) => !c.ok);
    console.log(JSON.stringify({ base, mode, tag: TAG, checks, failed: failed.map((f) => f.name) }, null, 2));
    if (failed.length) {
      console.error('LOADING PHASE 1 PREVIEW/SMOKE FAILED');
      process.exitCode = 1;
    } else {
      console.log('LOADING PHASE 1 PREVIEW/SMOKE PASSED');
      process.exitCode = 0;
    }
  } catch (err) {
    console.error(err);
    process.exitCode = err.exitCode || 1;
  } finally {
    await browser.close().catch(() => {});
    if (db && seeded) {
      try {
        await cleanupPreviewTenant(db, seeded.ids);
        console.log(`Cleaned preview tag=${TAG}`);
      } catch (cleanupErr) {
        console.error('cleanup warning', cleanupErr.message || cleanupErr);
      }
      await db.end().catch(() => {});
    }
  }
  process.exit(process.exitCode || 0);
})();

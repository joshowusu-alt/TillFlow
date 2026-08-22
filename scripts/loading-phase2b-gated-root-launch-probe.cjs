/**
 * Loading Phase 2B/2C — gated RootLaunchLoading probe.
 * Preview: seeds a tagged owner on Preview DB, then deletes those rows.
 * Production: read-only QA login; no inserts/updates/deletes.
 *
 * Env: BASE_URL, PLAYWRIGHT_OWNER_* (production), optional VERCEL_AUTOMATION_BYPASS_SECRET
 * Exit 0 pass, 1 fail, 2 blocked.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');
const { chromium, devices } = require('playwright');

const root = path.resolve(__dirname, '..');
const TAG = `LOAD_P2B_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;

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
    await page.waitForTimeout(400);
  }
  return false;
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

function cuidLike() {
  return `c${crypto.randomBytes(12).toString('hex')}`;
}

async function seedPreviewTenant(db, passwordHash) {
  const ids = {
    business: cuidLike(),
    store: cuidLike(),
    till: cuidLike(),
    owner: cuidLike(),
  };
  const email = `owner.${TAG.toLowerCase()}@example.com`;
  const password = `Pw_${TAG.slice(-8)}!aA1`;
  const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  await db.query(
    `INSERT INTO "Business" (
       id, name, currency, timezone, "subscriptionStatus",
       "trialStartedAt", "trialEndsAt", "businessCategory", "updatedAt"
     ) VALUES ($1,$2,'GHS','Africa/Accra','TRIAL_ACTIVE',NOW(),$3,'PROVISION',NOW())`,
    [ids.business, `Load P2B ${TAG}`, trialEnds],
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
    [ids.owner, ids.business, email, 'Load P2B Owner', passwordHash],
  );

  return { ids, email, password };
}

async function cleanupPreviewTenant(db, ids) {
  await db.query(`DELETE FROM "Till" WHERE "storeId" = $1`, [ids.store]);
  await db.query(`DELETE FROM "User" WHERE "businessId" = $1`, [ids.business]);
  await db.query(`DELETE FROM "Store" WHERE "businessId" = $1`, [ids.business]);
  await db.query(`DELETE FROM "Business" WHERE id = $1`, [ids.business]);
}

async function pollOpeningCopy(page, ms) {
  const hits = [];
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const snap = await page.evaluate(() => {
        const body = document.body?.innerText || '';
        return {
          pathname: location.pathname,
          opening: /Opening your business\.\.\.|Opening .+?\.\.\./i.test(body) &&
            /Checking your session|Getting today's sales/i.test(body),
          launchMessage: !!document.querySelector('#tillflow-launch-message'),
          launching: sessionStorage.getItem('tillflow:launching'),
        };
      });
      if (snap.opening || snap.launchMessage) hits.push({ t: Date.now() - start, ...snap });
    } catch {
      // mid-nav
    }
    await page.waitForTimeout(50);
  }
  return hits;
}

(async () => {
  const qa = loadEnvFile(path.join(root, '.playwright-qa.local.env'));
  const previewEnv = loadEnvFile(path.join(root, 'tmp/reporting-preview.local.env'));
  const base = (
    process.env.BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    qa.PLAYWRIGHT_BASE_URL ||
    ''
  ).replace(/\/$/, '');
  const bypass =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET ||
    previewEnv.VERCEL_AUTOMATION_BYPASS_SECRET ||
    '';
  const viewport = process.env.VIEWPORT === 'desktop' ? null : devices['iPhone 13'];
  const mode = process.env.SMOKE_MODE || (isProdHost(base) ? 'production' : 'preview');

  if (!base) {
    console.error('BLOCKED: missing BASE_URL');
    process.exit(2);
  }

  let email = process.env.PLAYWRIGHT_OWNER_EMAIL || qa.PLAYWRIGHT_OWNER_EMAIL;
  let password = process.env.PLAYWRIGHT_OWNER_PASSWORD || qa.PLAYWRIGHT_OWNER_PASSWORD;
  let db = null;
  let seeded = null;

  console.log(`Phase 2B probe base=${base} mode=${mode} viewport=${viewport ? 'mobile' : 'desktop'}`);

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
  } else if (!email || !password) {
    console.error('BLOCKED: production smoke needs QA owner credentials');
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...(viewport || {}),
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
    const loginPoll = pollOpeningCopy(page, 2200);
    await page.goto(
      bypass
        ? `${base}/login?x-vercel-protection-bypass=${encodeURIComponent(bypass)}`
        : `${base}/login`,
      { waitUntil: 'domcontentloaded', timeout: 90_000 },
    );
    const loginHits = await loginPoll;
    note(
      'no_launch_copy_hard_login',
      loginHits.length === 0,
      loginHits.length ? `saw launch on /login t=${loginHits[0].t}` : 'no Opening launch copy',
    );
    const loginText = await page.locator('body').innerText();
    note(
      'login_no_prior_business_name_leak',
      !/Opening EL-SHADDAI/i.test(loginText) && !/Load P2B /i.test(loginText),
      'login form settled',
    );

    const loggedIn = await login(page, context, base, email, password, bypass);
    assert(loggedIn, `login failed ${page.url()}`);
    note('owner_login', true, page.url());

    const reloadRoutes = [
      '/onboarding',
      '/pos',
      '/users',
      '/reports',
      '/reports/money-received',
      '/reports/business-movement',
      '/reports/momo-confirmation',
    ];

    for (const route of reloadRoutes) {
      const poll = pollOpeningCopy(page, 2800);
      await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      const hits = await poll;
      note(
        `no_launch_copy_hard_${route.replace(/\W+/g, '_')}`,
        hits.length === 0,
        hits.length ? `saw launch copy at t=${hits[0].t} path=${hits[0].pathname}` : 'no Opening launch copy',
      );
      await page.waitForTimeout(400);
      const settled = await page.locator('body').innerText();
      note(
        `settled_${route.replace(/\W+/g, '_')}`,
        settled.length > 40 && !/Internal Server Error/i.test(settled),
        `len=${settled.length}`,
      );
    }

    // Soft report navigation
    await page.goto(`${base}/reports`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForTimeout(600);
    let softHits = [];
    const p1 = pollOpeningCopy(page, 2500);
    try {
      await page.locator('a[href="/reports/money-received"], a[href^="/reports/money-received?"]').first().click({ timeout: 8000 });
    } catch {
      await page.goto(`${base}/reports/money-received`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    }
    softHits = await p1;
    note('no_launch_copy_reports_to_money_received', softHits.length === 0, softHits.length ? 'saw launch' : 'ok');

    // Users list (post-save landing analogue — no mutation)
    await page.goto(`${base}/users`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForTimeout(500);
    const usersText = await page.locator('body').innerText();
    note('users_list_no_launch_copy', !/Opening your business/i.test(usersText), 'settled users');

    const savePoll = pollOpeningCopy(page, 2500);
    await page.goto(`${base}/users?success=created`, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
    const saveHits = await savePoll;
    note(
      'no_launch_copy_post_save_users_redirect',
      saveHits.length === 0,
      saveHits.length ? 'saw launch after users success redirect' : 'ok',
    );

    // Intentional /launch still branded
    const launchPoll = pollOpeningCopy(page, 2500);
    await page.goto(`${base}/launch`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    const launchHits = await launchPoll;
    note(
      'intentional_launch_shows_copy',
      launchHits.some((h) => h.launchMessage || h.opening),
      launchHits.length ? `hits=${launchHits.length}` : 'no launch copy on /launch',
    );

    const failed = checks.filter((c) => !c.ok);
    console.log(JSON.stringify({ base, checks, failed: failed.map((f) => f.name) }, null, 2));
    if (failed.length) {
      console.error('GATED ROOT LAUNCH PROBE FAILED');
      process.exit(1);
    }
    console.log('GATED ROOT LAUNCH PROBE PASSED');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(err.exitCode || 1);
  } finally {
    await browser.close().catch(() => {});
    if (db && seeded) {
      try {
        await cleanupPreviewTenant(db, seeded.ids);
        console.log(`Cleaned preview tag=${TAG}`);
      } catch (cleanupErr) {
        console.error('preview cleanup failed', cleanupErr);
      }
      await db.end().catch(() => {});
    } else if (db) {
      await db.end().catch(() => {});
    }
  }
})();

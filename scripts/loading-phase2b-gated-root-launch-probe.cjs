/**
 * Loading Phase 2B — gated RootLaunchLoading probe (read-only).
 * Asserts “Opening your business…” is absent on authenticated hard reloads
 * and present only on intentional /launch.
 *
 * Env: BASE_URL, PLAYWRIGHT_OWNER_*, optional VERCEL_AUTOMATION_BYPASS_SECRET
 * Exit 0 pass, 1 fail, 2 blocked.
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium, devices } = require('playwright');

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
  const email = process.env.PLAYWRIGHT_OWNER_EMAIL || qa.PLAYWRIGHT_OWNER_EMAIL;
  const password = process.env.PLAYWRIGHT_OWNER_PASSWORD || qa.PLAYWRIGHT_OWNER_PASSWORD;
  const viewport = process.env.VIEWPORT === 'desktop' ? null : devices['iPhone 13'];

  if (!base || !email || !password) {
    console.error('BLOCKED: missing BASE_URL / owner credentials');
    process.exit(2);
  }

  console.log(`Phase 2B probe base=${base} viewport=${viewport ? 'mobile' : 'desktop'}`);

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
  }
})();

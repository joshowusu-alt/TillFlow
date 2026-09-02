/**
 * Lab-only UI programme evidence. Localhost production `next start` only.
 * Never Production. Never creates sales, products, payments or imports.
 *
 * Usage:
 *   BASE_URL=http://localhost:6200 node scripts/ui-programme-lab-evidence.cjs
 *
 * Writes JSON + screenshots to tmp/ui-programme-evidence/ (gitignored).
 * Metrics are laboratory (Playwright Chromium, unthrottled unless CPU/network
 * flags are set). They are not field LCP/INP/CLS.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const BASE_URL = process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:6200';
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL || 'owner@store.com';
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD || 'Pass1234!';
const OUT_DIR = path.join(process.cwd(), 'tmp', 'ui-programme-evidence');

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function assertLabTarget() {
  const host = hostnameOf(BASE_URL);
  if (host === 'tillflow.app' || host === 'www.tillflow.app') {
    throw new Error('BLOCKED: ui-programme lab evidence cannot target Production');
  }
}

const VIEWPORTS = [
  { name: 'p-320x568', width: 320, height: 568 },
  { name: 'p-390x844', width: 390, height: 844 },
  { name: 'l-844x390', width: 844, height: 390 },
  { name: 't-768x1024', width: 768, height: 1024 },
  { name: 'd-1280x720', width: 1280, height: 720 },
];

const ROUTES = ['/onboarding', '/pos', '/products', '/purchases', '/shifts', '/settings', '/reports'];

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(OWNER_EMAIL);
  await page.locator('input[name="password"]').fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (/\/pos|\/onboarding/.test(page.url())) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`Login did not reach Home or POS (${page.url()})`);
}

async function measure(page, route) {
  const started = Date.now();
  const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
  const ttfb = response?.request()?.timing()?.responseStart ?? null;
  await page.locator('#main-content').waitFor({ state: 'visible', timeout: 30_000 }).catch(() => null);
  await page.waitForLoadState('load').catch(() => null);
  await page.waitForTimeout(300);
  const usefulShellMs = Date.now() - started;
  const lcp = await page.evaluate(() => {
    const entries = performance.getEntriesByType('largest-contentful-paint');
    const last = entries[entries.length - 1];
    return last ? Math.round(last.startTime) : null;
  });
  return {
    route,
    status: response?.status() ?? null,
    ttfbMs: ttfb,
    usefulShellMs,
    lcpMs: lcp,
    method: 'lab-playwright-chromium-unthrottled',
  };
}

async function main() {
  assertLabTarget();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await login(page);

  const runs = [];
  for (let i = 0; i < 3; i += 1) {
    const sample = [];
    for (const route of ROUTES) {
      sample.push(await measure(page, route));
    }
    runs.push(sample);
  }

  const screenshots = [];
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of ['/onboarding', '/pos']) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
      await page.locator('#main-content').waitFor({ state: 'visible', timeout: 30_000 }).catch(() => null);
      const file = `${viewport.name}${route.replaceAll('/', '-')}.png`;
      await page.screenshot({ path: path.join(OUT_DIR, file), fullPage: false });
      screenshots.push(file);
    }
  }

  const summary = {
    capturedAt: new Date().toISOString(),
    baseUrlHost: hostnameOf(BASE_URL),
    classification: 'laboratory',
    notFieldCWV: true,
    runs,
    screenshots,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'lab-summary.json'), JSON.stringify(summary, null, 2));
  await browser.close();
  console.log(`Wrote ${path.join(OUT_DIR, 'lab-summary.json')} (${screenshots.length} screenshots)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

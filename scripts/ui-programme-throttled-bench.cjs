/**
 * Throttled laboratory benchmark for the UI programme.
 * Never Production. Never creates sales, products, payments or imports.
 * Results are laboratory metrics, not field CWV.
 *
 * Usage:
 *   LABEL=final BASE_URL=http://localhost:6200 node scripts/ui-programme-throttled-bench.cjs
 *
 * Optional:
 *   SAMPLES=5 CPU_RATE=4 NETWORK=slow-4g
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const BASE_URL = process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:6200';
const LABEL = process.env.LABEL || 'current';
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL || 'owner@store.com';
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD || 'Pass1234!';
const SAMPLES = Math.max(3, Number(process.env.SAMPLES || 5));
const CPU_RATE = Math.max(1, Number(process.env.CPU_RATE || 4));
const NETWORK = process.env.NETWORK || 'slow-4g';
const OUT_DIR = path.join(process.cwd(), 'tmp', 'ui-programme-evidence');

const NETWORK_PROFILES = {
  'slow-4g': { offline: false, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 },
  'fast-3g': { offline: false, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 562 },
  wifi: { offline: false, downloadThroughput: (30 * 1024 * 1024) / 8, uploadThroughput: (15 * 1024 * 1024) / 8, latency: 20 },
};

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
    throw new Error('BLOCKED: throttled bench cannot target Production');
  }
}

function median(values) {
  const nums = values.filter((value) => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : Math.round((nums[mid - 1] + nums[mid]) / 2);
}

function spread(values) {
  const nums = values.filter((value) => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
  if (!nums.length) return { min: null, max: null, p90: null };
  const p90 = nums[Math.min(nums.length - 1, Math.ceil(nums.length * 0.9) - 1)];
  return { min: nums[0], max: nums[nums.length - 1], p90 };
}

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

async function applyThrottle(page) {
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE });
  const profile = NETWORK_PROFILES[NETWORK] || NETWORK_PROFILES['slow-4g'];
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', profile);
  return client;
}

async function collectPaint(page) {
  return page.evaluate(() => {
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
    const lcp = lcpEntries.length ? Math.round(lcpEntries[lcpEntries.length - 1].startTime) : null;
    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    let transferred = 0;
    for (const resource of resources) {
      transferred += resource.transferSize || 0;
    }
    const layoutShifts = performance.getEntriesByType('layout-shift');
    let cls = 0;
    for (const shift of layoutShifts) {
      if (!shift.hadRecentInput) cls += shift.value;
    }
    const lab = window.__tfLab || { lcp: null, cls: 0 };
    return {
      lcpMs: lab.lcp ?? lcp,
      ttfbMs: nav ? Math.round(nav.responseStart) : null,
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      loadMs: nav ? Math.round(nav.loadEventEnd) : null,
      transferredBytes: transferred,
      resourceCount: resources.length,
      cls: Math.round((lab.cls || cls) * 1000) / 1000,
    };
  });
}

async function measureRoute(page, route, extra = {}) {
  const started = Date.now();
  const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
  const ttfbHeader = response?.request()?.timing()?.responseStart ?? null;
  await page.locator('#main-content').waitFor({ state: 'visible', timeout: 45_000 }).catch(() => null);
  const usefulShellMs = Date.now() - started;
  let checkoutReadyMs = null;
  if (route === '/pos') {
    const search = page.getByLabel(/search products/i).first();
    await search.waitFor({ state: 'visible', timeout: 45_000 }).catch(() => null);
    checkoutReadyMs = Date.now() - started;
  }
  await page.waitForTimeout(400);
  const paint = await collectPaint(page);
  const desktopNavCount = await page.locator('nav[aria-label="Main navigation"] a, nav[aria-label="Main navigation"] button').count();
  return {
    route,
    status: response?.status() ?? null,
    ttfbMs: paint.ttfbMs ?? ttfbHeader,
    usefulShellMs,
    checkoutReadyMs,
    lcpMs: paint.lcpMs,
    cls: paint.cls,
    transferredBytes: paint.transferredBytes,
    resourceCount: paint.resourceCount,
    desktopNavControlCount: desktopNavCount,
    ...extra,
  };
}

async function measureHomeToPos(page) {
  await page.goto(`${BASE_URL}/onboarding`, { waitUntil: 'domcontentloaded' });
  await page.locator('#main-content').waitFor({ state: 'visible', timeout: 45_000 });
  const started = Date.now();
  const clickStarted = Date.now();
  const posLink = page.locator('a.home-open-pos, a[href="/pos"]').first();
  if ((await posLink.count()) > 0) {
    await posLink.click();
  } else {
    await page.goto(`${BASE_URL}/pos`, { waitUntil: 'domcontentloaded' });
  }
  const interactionMs = Date.now() - clickStarted;
  await page.locator('#main-content').waitFor({ state: 'visible', timeout: 45_000 }).catch(() => null);
  const usefulShellMs = Date.now() - started;
  await page.getByLabel(/search products/i).first().waitFor({ state: 'visible', timeout: 45_000 }).catch(() => null);
  const checkoutReadyMs = Date.now() - started;
  return { route: 'home-to-pos', interactionMs, usefulShellMs, checkoutReadyMs };
}

async function main() {
  assertLabTarget();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const viewports = [
    { name: 'mobile-portrait', width: 390, height: 844 },
    { name: 'mobile-landscape', width: 844, height: 390 },
    { name: 'desktop', width: 1280, height: 720 },
  ];
  const routes = ['/onboarding', '/pos', '/products', '/purchases', '/shifts', '/reports'];
  const all = [];

  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__tfLab = { lcp: null, cls: 0 };
      try {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1];
          if (last) window.__tfLab.lcp = Math.round(last.startTime);
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) window.__tfLab.cls += entry.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
      } catch {
        // Older Chromium without these entry types.
      }
    });
    await applyThrottle(page);
    await login(page);

    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const cacheMode = sample === 0 ? 'cold' : 'warm';
      if (sample === 0) {
        await context.clearCookies();
        await login(page);
      }
      for (const route of routes) {
        const row = await measureRoute(page, route, {
          sample,
          cacheMode,
          viewport: viewport.name,
        });
        all.push(row);
      }
      all.push({
        ...(await measureHomeToPos(page)),
        sample,
        cacheMode,
        viewport: viewport.name,
        status: 200,
      });
    }
    await context.close();
  }

  const grouped = {};
  for (const row of all) {
    const key = `${row.viewport}:${row.route}:${row.cacheMode ?? 'warm'}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  }
  const summary = Object.fromEntries(
    Object.entries(grouped).map(([key, rows]) => {
      const pick = (field) => rows.map((row) => row[field]);
      return [
        key,
        {
          n: rows.length,
          usefulShellMs: { median: median(pick('usefulShellMs')), ...spread(pick('usefulShellMs')) },
          lcpMs: { median: median(pick('lcpMs')), ...spread(pick('lcpMs')) },
          ttfbMs: { median: median(pick('ttfbMs')), ...spread(pick('ttfbMs')) },
          cls: { median: median(pick('cls')), ...spread(pick('cls')) },
          checkoutReadyMs: { median: median(pick('checkoutReadyMs')), ...spread(pick('checkoutReadyMs')) },
          interactionMs: { median: median(pick('interactionMs')), ...spread(pick('interactionMs')) },
          transferredBytes: { median: median(pick('transferredBytes')), ...spread(pick('transferredBytes')) },
          desktopNavControlCount: median(pick('desktopNavControlCount')),
        },
      ];
    }),
  );

  const payload = {
    capturedAt: new Date().toISOString(),
    label: LABEL,
    baseUrlHost: hostnameOf(BASE_URL),
    classification: 'laboratory',
    notFieldCWV: true,
    throttle: { cpuRate: CPU_RATE, network: NETWORK },
    samples: SAMPLES,
    summary,
    runs: all,
  };
  const file = path.join(OUT_DIR, `throttled-bench-${LABEL}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  await browser.close();
  process.stdout.write(`${file}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

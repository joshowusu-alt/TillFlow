/**
 * Gate E laboratory benchmark. Not field CWV.
 * Same harness against every SHA. Never Production. Never mutating POS/finance writes.
 *
 * Usage:
 *   node scripts/ui-programme-gate-e-bench.cjs
 *
 * Env:
 *   GATE_E_TARGETS  JSON array of { label, sha, baseUrl }
 *   SAMPLES         measured samples per scenario (default 5); plus 1 warmup excluded
 *   OUT_DIR         artifact directory
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL || 'owner@store.com';
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD || 'Pass1234!';
const SAMPLES = Math.max(5, Number(process.env.SAMPLES || 5));
const OUT_DIR = process.env.OUT_DIR || path.join(process.cwd(), 'tmp', 'gate-e');
const CPU_MOBILE = Math.max(1, Number(process.env.CPU_RATE || 4));
const NETWORK = process.env.NETWORK || 'slow-4g';
const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 90_000);

const NETWORK_PROFILES = {
  'slow-4g': {
    offline: false,
    downloadThroughput: Math.round((1.6 * 1024 * 1024) / 8),
    uploadThroughput: Math.round((750 * 1024) / 8),
    latency: 150,
  },
};

const DEFAULT_TARGETS = [
  { label: 'production', sha: '8bd7d54e061aafae251100cff0e91c05bb666e77', baseUrl: 'http://127.0.0.1:6202' },
  { label: 'phase1', sha: 'a344a233a83dc62a36be894d308c0f81dedbbf99', baseUrl: 'http://127.0.0.1:6203' },
  { label: 'final', sha: 'fd7b32ac3a02c6c781c895f6f0bb4d1e4283e624', baseUrl: 'http://127.0.0.1:6204' },
];

function parseTargets() {
  if (!process.env.GATE_E_TARGETS) return DEFAULT_TARGETS;
  const parsed = JSON.parse(process.env.GATE_E_TARGETS);
  if (!Array.isArray(parsed) || parsed.length !== 3) {
    throw new Error('GATE_E_TARGETS must be a JSON array of 3 {label,sha,baseUrl}');
  }
  return parsed;
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function assertLabTarget(url) {
  const host = hostnameOf(url);
  if (host === 'tillflow.app' || host === 'www.tillflow.app' || host.endsWith('.tillflow.app')) {
    throw new Error(`BLOCKED: Gate E bench cannot target Production (${url})`);
  }
}

function quantile(values, q) {
  const nums = values.filter((value) => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const index = Math.min(nums.length - 1, Math.max(0, Math.ceil(nums.length * q) - 1));
  return nums[index];
}

function stats(values) {
  const nums = values.filter((value) => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
  if (!nums.length) return { n: 0, median: null, p75: null, min: null, max: null, range: null };
  const median = nums.length % 2 ? nums[(nums.length - 1) / 2] : Math.round((nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2);
  const p75 = quantile(nums, 0.75);
  return {
    n: nums.length,
    median,
    p75,
    min: nums[0],
    max: nums[nums.length - 1],
    range: nums[nums.length - 1] - nums[0],
  };
}

function rotate(list, offset) {
  const copy = [...list];
  const n = ((offset % copy.length) + copy.length) % copy.length;
  return copy.slice(n).concat(copy.slice(0, n));
}

function initLabScript() {
  window.__tfLab = {
    lcp: null,
    cls: 0,
    inp: null,
    longTasks: [],
    hydrationMs: null,
    errors: [],
  };
  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) window.__tfLab.lcp = Math.round(last.startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch { /* older Chromium */ }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__tfLab.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch { /* older Chromium */ }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const duration = entry.duration || 0;
        window.__tfLab.inp = Math.max(window.__tfLab.inp || 0, duration);
      }
    }).observe({ type: 'event', buffered: true });
  } catch { /* Event Timing not always present */ }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__tfLab.longTasks.push({ start: Math.round(entry.startTime), duration: Math.round(entry.duration) });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* longtask may need origin trial; ignore */ }
}

async function collectPaint(page) {
  return page.evaluate(() => {
    const lab = window.__tfLab || { lcp: null, cls: 0, inp: null, longTasks: [] };
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
    const lcp = lcpEntries.length ? Math.round(lcpEntries[lcpEntries.length - 1].startTime) : null;
    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    let transferredJs = 0;
    let transferredAll = 0;
    const jsFiles = [];
    for (const resource of resources) {
      transferredAll += resource.transferSize || 0;
      if (resource.initiatorType === 'script' || /\.js(\?|$)/.test(resource.name)) {
        transferredJs += resource.transferSize || 0;
        jsFiles.push({ name: resource.name.split('/').pop(), bytes: resource.transferSize || 0, decoded: resource.decodedBodySize || 0 });
      }
    }
    const measures = performance.getEntriesByType('measure');
    const hydration = measures.find((entry) => /hydrat/i.test(entry.name));
    const nextHydration = performance.getEntriesByName('Next.js-hydration')[0]
      || performance.getEntriesByName('Next.js-hydration-end')[0];
    return {
      lcpMs: lab.lcp ?? lcp,
      ttfbMs: nav ? Math.round(nav.responseStart) : null,
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      loadMs: nav ? Math.round(nav.loadEventEnd) : null,
      transferredBytes: transferredAll,
      transferredJsBytes: transferredJs,
      jsFileCount: jsFiles.length,
      topJs: jsFiles.sort((a, b) => b.bytes - a.bytes).slice(0, 8),
      cls: Math.round((lab.cls || 0) * 1000) / 1000,
      inpMs: lab.inp != null ? Math.round(lab.inp) : null,
      longTaskCount: (lab.longTasks || []).length,
      longTaskMs: (lab.longTasks || []).reduce((sum, task) => sum + (task.duration || 0), 0),
      hydrationMs: hydration ? Math.round(hydration.duration) : (nextHydration ? Math.round(nextHydration.duration || nextHydration.startTime) : null),
      measureNames: measures.map((entry) => entry.name).slice(0, 20),
    };
  });
}

async function collectDualNav(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Main navigation"]');
    const html = nav ? nav.innerHTML : '';
    return {
      present: Boolean(nav),
      dataDesktopNav: nav?.getAttribute('data-desktop-nav') || null,
      linkCount: nav ? nav.querySelectorAll('a').length : 0,
      buttonCount: nav ? nav.querySelectorAll('button').length : 0,
      htmlBytes: new TextEncoder().encode(html).length,
      hiddenByCss: nav ? getComputedStyle(nav).display === 'none' : null,
    };
  });
}

async function collectMemory(client) {
  try {
    const metrics = await client.send('Performance.getMetrics');
    const used = metrics.metrics.find((metric) => metric.name === 'JSHeapUsedSize');
    return used ? Math.round(used.value) : null;
  } catch {
    return null;
  }
}

function attachGuards(page, bucket) {
  page.on('pageerror', (error) => {
    bucket.pageErrors.push(String(error));
  });
  page.on('console', (msg) => {
    const text = msg.text();
    if (/hydrat/i.test(text) && msg.type() === 'error') bucket.hydrationErrors.push(text);
    if (msg.type() === 'error' && /failed to load|server error|application error/i.test(text)) {
      bucket.consoleErrors.push(text);
    }
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status >= 500) bucket.serverErrors.push(`${status} ${response.url()}`);
  });
  page.on('request', (request) => {
    const method = request.method();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
    let pathname = '';
    try {
      pathname = new URL(request.url()).pathname;
    } catch {
      pathname = request.url();
    }
    if (pathname === '/login' || pathname.startsWith('/login')) return;
    const post = request.postData() || '';
    const writeHint = /complete.?sale|createSale|openShift|closeShift|recordPayment|adjustStock|postStocktake|importProducts|voidSale/i;
    const writePath = /\/api\/.*(sale|payment|import|stock|shift|purchase)/i;
    const entry = { method, url: pathname, hasNextAction: Boolean(request.headers()['next-action']) };
    if (writePath.test(pathname) || writeHint.test(pathname) || writeHint.test(post)) {
      bucket.mutatingRequests.push(entry);
    } else {
      bucket.serverActions.push(entry);
    }
  });
  page.on('request', (request) => {
    const type = request.resourceType();
    if (type === 'document' || type === 'fetch' || type === 'xhr' || type === 'other') {
      bucket.requests.push({ type, url: request.url(), method: request.method() });
    }
  });
}

async function applyProfile(page, profile) {
  const client = await page.context().newCDPSession(page);
  await client.send('Performance.enable').catch(() => null);
  await client.send('Network.enable');
  if (profile.cacheDisabled) {
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  } else {
    await client.send('Network.setCacheDisabled', { cacheDisabled: false });
  }
  if (profile.cpuRate > 1) {
    await client.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuRate });
  } else {
    await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  if (profile.network) {
    await client.send('Network.emulateNetworkConditions', profile.network);
  } else {
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  }
  return client;
}

async function measureBusyLoop(page, workMs = 200) {
  const start = Date.now();
  await page.evaluate((ms) => {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      // busy loop — laboratory throttle proof only
    }
  }, workMs);
  return Date.now() - start;
}

async function proveCpuThrottle(page, client, cpuRate) {
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const unthrottledMs = await measureBusyLoop(page, 200);
  await client.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  const throttledMs = await measureBusyLoop(page, 200);
  const ratio = unthrottledMs > 0 ? throttledMs / unthrottledMs : 0;
  const ok = cpuRate <= 1 ? true : (throttledMs >= 450 || ratio >= 2.2);
  return { unthrottledMs, throttledMs, ratio: Math.round(ratio * 100) / 100, cpuRate, ok, honored: ok };
}

async function proveNetworkThrottle(page, baseUrl, expectedLatency) {
  if (!expectedLatency) {
    return { ttfbMs: null, expectedLatency: 0, ok: true, skipped: true };
  }
  const started = Date.now();
  const response = await page.goto(`${baseUrl}/login`, { waitUntil: 'commit', timeout: 90_000 });
  const timing = response?.request()?.timing();
  const ttfbMs = timing && timing.responseStart >= 0
    ? Math.round(timing.responseStart)
    : Date.now() - started;
  return {
    ttfbMs,
    status: response?.status() ?? null,
    expectedLatency,
    ok: ttfbMs >= Math.max(80, expectedLatency * 0.4),
  };
}

async function login(page, baseUrl) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
  await page.locator('input[name="email"]').fill(OWNER_EMAIL);
  await page.locator('input[name="password"]').fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  try {
    await page.waitForURL(/\/(pos|onboarding)/, { timeout: 120_000 });
  } catch (error) {
    const url = page.url();
    const body = await page.locator('body').innerText().catch(() => '');
    throw new Error(`Login did not reach Home or POS (${url}): ${body.slice(0, 240)}`);
  }
}

async function waitHomeUseful(page) {
  const cta = page.getByRole('link', { name: /open pos/i }).or(page.locator('a.home-open-pos'));
  await cta.first().waitFor({ state: 'visible', timeout: 45_000 });
  const box = await cta.first().boundingBox();
  if (!box || box.width < 8 || box.height < 8) {
    throw new Error('Home Open POS control is not a usable hit target');
  }
  await page.locator('.tf-loading-skeleton, [data-loading-kind]').first().waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => null);
}

async function waitPosUseful(page) {
  await page.getByLabel(/search products/i).first().waitFor({ state: 'visible', timeout: 45_000 });
  const card = page.locator('[data-pos-search-card="true"]');
  if (await card.count()) {
    await card.first().waitFor({ state: 'visible', timeout: 15_000 });
  }
}

async function waitPosCheckoutReady(page) {
  const ready = page.locator('[data-pos-till-compact="ready"], [data-checkout-till-state="ready"]');
  await ready.first().waitFor({ state: 'visible', timeout: 45_000 });
  const loading = page.locator('[data-pos-till-compact="loading"], [data-checkout-till-state="loading"]');
  if (await loading.count()) {
    await loading.first().waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => null);
  }
}

async function waitRouteInteractive(page, route) {
  if (route === '/onboarding') return waitHomeUseful(page);
  if (route === '/pos') return waitPosUseful(page);
  const heading = page.locator('#main-content h1, #main-content [data-page-title], main h1').first();
  await heading.waitFor({ state: 'visible', timeout: 45_000 });
  const search = page.locator('#main-content input, #main-content a, #main-content button').first();
  await search.waitFor({ state: 'visible', timeout: 20_000 });
}

function newBucket() {
  return { pageErrors: [], hydrationErrors: [], consoleErrors: [], serverErrors: [], mutatingRequests: [], serverActions: [], requests: [] };
}

async function openSession(browser, target, viewport, profile) {
  const bucket = newBucket();
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    serviceWorkers: 'block',
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
  page.setDefaultTimeout(NAV_TIMEOUT_MS);
  attachGuards(page, bucket);
  await page.addInitScript(initLabScript);
  const client = await applyProfile(page, profile);
  await login(page, target.baseUrl);
  return { context, page, client, bucket };
}

async function measureNavigation(session, target, route, extra) {
  const { page, client, bucket } = session;
  bucket.requests = [];
  const started = Date.now();
  const response = await page.goto(`${target.baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
  if ((response?.status() ?? 200) >= 500) {
    throw new Error(`Server ${response.status()} on ${route} (${target.label})`);
  }
  const ttfbHeader = response?.request()?.timing()?.responseStart ?? null;
  await waitRouteInteractive(page, route);
  const usefulShellMs = Date.now() - started;
  let checkoutReadyMs = null;
  if (route === '/pos') {
    await waitPosCheckoutReady(page);
    checkoutReadyMs = Date.now() - started;
  }
  const interactiveMs = Date.now() - started;
  await page.waitForTimeout(350);
  const paint = await collectPaint(page);
  const dualNav = await collectDualNav(page);
  const heap = await collectMemory(client);
  if (bucket.pageErrors.length) throw new Error(`pageerror on ${route}: ${bucket.pageErrors[0]}`);
  if (bucket.hydrationErrors.length) throw new Error(`hydration error on ${route}: ${bucket.hydrationErrors[0]}`);
  if (bucket.serverErrors.length) throw new Error(`server error on ${route}: ${bucket.serverErrors[0]}`);
  if (bucket.mutatingRequests.length) {
    throw new Error(`mutating request during ${route}: ${JSON.stringify(bucket.mutatingRequests[0])}`);
  }
  return {
    route,
    status: response?.status() ?? null,
    ttfbMs: paint.ttfbMs ?? ttfbHeader,
    usefulShellMs,
    interactiveMs,
    checkoutReadyMs,
    lcpMs: paint.lcpMs,
    cls: paint.cls,
    inpMs: paint.inpMs,
    hydrationMs: paint.hydrationMs,
    longTaskCount: paint.longTaskCount,
    longTaskMs: paint.longTaskMs,
    transferredBytes: paint.transferredBytes,
    transferredJsBytes: paint.transferredJsBytes,
    jsFileCount: paint.jsFileCount,
    topJs: paint.topJs,
    queryishRequestCount: bucket.requests.filter((req) => req.method === 'GET').length,
    heapUsedBytes: heap,
    dualNav,
    ...extra,
  };
}

async function measureHomeToPos(session, target, extra) {
  const { page, bucket } = session;
  bucket.requests = [];
  await page.goto(`${target.baseUrl}/onboarding`, { waitUntil: 'domcontentloaded' });
  await waitHomeUseful(page);
  const cta = page.getByRole('link', { name: /open pos/i }).or(page.locator('a.home-open-pos')).first();
  const started = Date.now();
  await cta.click();
  await waitPosUseful(page);
  const usefulShellMs = Date.now() - started;
  await waitPosCheckoutReady(page);
  const checkoutReadyMs = Date.now() - started;
  const paint = await collectPaint(page);
  if (bucket.mutatingRequests.length) {
    throw new Error(`mutating request during home-to-pos: ${JSON.stringify(bucket.mutatingRequests[0])}`);
  }
  return {
    route: 'home-to-pos',
    interactionMs: usefulShellMs,
    usefulShellMs,
    checkoutReadyMs,
    lcpMs: paint.lcpMs,
    cls: paint.cls,
    inpMs: paint.inpMs,
    ...extra,
  };
}

async function measureOrientation(session, viewport, extra) {
  const { page } = session;
  const started = Date.now();
  await page.setViewportSize({ width: viewport.height, height: viewport.width });
  await waitHomeUseful(page).catch(async () => waitPosUseful(page));
  const ms = Date.now() - started;
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  return { route: 'orientation-change', usefulShellMs: ms, ...extra };
}

async function clickLatency(session, extra) {
  const { page } = session;
  const cta = page.getByRole('link', { name: /open pos/i }).or(page.locator('a.home-open-pos')).first();
  if (!(await cta.count())) {
    await page.goto(page.url().replace(/\/pos.*/, '/onboarding'), { waitUntil: 'domcontentloaded' }).catch(() => null);
    await waitHomeUseful(page);
  }
  const started = Date.now();
  await cta.click();
  await waitPosUseful(page);
  return { route: 'open-pos-click', interactionMs: Date.now() - started, ...extra };
}

function summarize(rows) {
  const keys = [
    'ttfbMs', 'usefulShellMs', 'interactiveMs', 'checkoutReadyMs', 'lcpMs', 'cls',
    'inpMs', 'hydrationMs', 'longTaskMs', 'transferredBytes', 'transferredJsBytes',
    'queryishRequestCount', 'heapUsedBytes', 'interactionMs',
  ];
  const byKey = {};
  for (const key of keys) {
    byKey[key] = stats(rows.map((row) => row[key]));
  }
  const dualNavLinks = stats(rows.map((row) => row.dualNav?.linkCount));
  const dualNavBytes = stats(rows.map((row) => row.dualNav?.htmlBytes));
  return { sampleCount: rows.length, metrics: byKey, dualNavLinks, dualNavBytes };
}

async function main() {
  const targets = parseTargets();
  for (const target of targets) assertLabTarget(target.baseUrl);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const chromiumVersion = browser.version();
  const meta = {
    kind: 'laboratory',
    notFieldCWV: true,
    node: process.version,
    chromium: chromiumVersion,
    os: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpuModel: os.cpus()[0]?.model || null,
    samplesMeasured: SAMPLES,
    warmupExcluded: 1,
    networkProfile: NETWORK,
    mobileCpuRate: CPU_MOBILE,
    cpuThrottleHonored: null,
    fixture: 'db:prepare:ci + onboardingCompletedAt stamp + one OPEN shift; seed owner@store.com; no sales created at runtime',
    productionBuild: 'next build (NODE_ENV=production) then next start; isolated .next per worktree',
    readiness: {
      home: 'Open POS link visible and hittable; not #main-content alone',
      posUseful: 'Search products control + search card when present',
      posCheckout: 'data-pos-till-compact=ready or data-checkout-till-state=ready; loading chip gone',
    },
    targets,
  };

  const profiles = [
    {
      name: 'mobile-portrait-throttled',
      viewport: { name: 'mobile-portrait', width: 390, height: 844 },
      cpuRate: CPU_MOBILE,
      network: NETWORK_PROFILES[NETWORK],
      cacheDisabledCold: true,
    },
    {
      name: 'mobile-landscape-throttled',
      viewport: { name: 'mobile-landscape', width: 844, height: 390 },
      cpuRate: CPU_MOBILE,
      network: NETWORK_PROFILES[NETWORK],
      cacheDisabledCold: true,
    },
    {
      name: 'desktop-unthrottled',
      viewport: { name: 'desktop', width: 1280, height: 720 },
      cpuRate: 1,
      network: null,
      cacheDisabledCold: true,
    },
  ];

  const routes = ['/onboarding', '/pos', '/products', '/purchases', '/shifts', '/reports'];
  const raw = [];
  const proofs = [];
  const executionOrder = [];

  try {
    const proofPage = await browser.newPage();
    proofPage.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    proofPage.setDefaultTimeout(NAV_TIMEOUT_MS);
    const proofClient = await applyProfile(proofPage, {
      cpuRate: CPU_MOBILE,
      network: NETWORK_PROFILES[NETWORK],
      cacheDisabled: true,
    });
    const cpuProof = await proveCpuThrottle(proofPage, proofClient, CPU_MOBILE);
    const netProof = await proveNetworkThrottle(proofPage, targets[0].baseUrl, NETWORK_PROFILES[NETWORK].latency);
    proofs.push({ cpuProof, netProof, chromium: chromiumVersion });
    meta.cpuThrottleHonored = cpuProof.ok;
    if (!netProof.ok) throw new Error(`Network throttle proof failed: ${JSON.stringify(netProof)}`);
    if (!cpuProof.ok) {
      process.stdout.write(`[gate-e] CPU 4x not honored by Chromium ${chromiumVersion} on this runner (${JSON.stringify(cpuProof)}). Network Slow-4G remains active. Results labelled accordingly.\n`);
    }
    await proofClient.detach().catch(() => null);
    await proofPage.close();

    for (const profile of profiles) {
      const totalPasses = SAMPLES + 1;
      for (let pass = 0; pass < totalPasses; pass += 1) {
        const warmup = pass === 0;
        const sample = warmup ? 'warmup' : pass;
        const order = rotate(targets, pass + (profile.name.length % 3));
        executionOrder.push({ profile: profile.name, pass, warmup, order: order.map((item) => item.label) });
        for (const target of order) {
          const coldProfile = {
            cpuRate: profile.cpuRate,
            network: profile.network,
            cacheDisabled: true,
          };
          const session = await openSession(browser, target, profile.viewport, coldProfile);
          try {
            const coldHome = await measureNavigation(session, target, '/onboarding', {
              label: target.label,
              sha: target.sha,
              profile: profile.name,
              viewport: profile.viewport.name,
              cache: 'cold',
              warmup,
              sample,
            });
            raw.push(coldHome);

            await session.client.send('Network.setCacheDisabled', { cacheDisabled: false });
            const warmHome = await measureNavigation(session, target, '/onboarding', {
              label: target.label,
              sha: target.sha,
              profile: profile.name,
              viewport: profile.viewport.name,
              cache: 'warm',
              warmup,
              sample,
            });
            raw.push(warmHome);

            const homeToPos = await measureHomeToPos(session, target, {
              label: target.label,
              sha: target.sha,
              profile: profile.name,
              viewport: profile.viewport.name,
              cache: 'warm',
              warmup,
              sample,
            });
            raw.push(homeToPos);

            const pos = await measureNavigation(session, target, '/pos', {
              label: target.label,
              sha: target.sha,
              profile: profile.name,
              viewport: profile.viewport.name,
              cache: 'warm',
              warmup,
              sample,
            });
            raw.push(pos);

            for (const route of ['/products', '/purchases', '/shifts', '/reports']) {
              raw.push(await measureNavigation(session, target, route, {
                label: target.label,
                sha: target.sha,
                profile: profile.name,
                viewport: profile.viewport.name,
                cache: 'warm',
                warmup,
                sample,
              }));
            }

            if (profile.viewport.name !== 'desktop') {
              await session.page.goto(`${target.baseUrl}/onboarding`, { waitUntil: 'domcontentloaded' });
              await waitHomeUseful(session.page);
              raw.push(await measureOrientation(session, profile.viewport, {
                label: target.label,
                sha: target.sha,
                profile: profile.name,
                viewport: profile.viewport.name,
                cache: 'warm',
                warmup,
                sample,
              }));
            }

            if (!warmup && profile.viewport.name === 'mobile-portrait') {
              await session.page.goto(`${target.baseUrl}/onboarding`, { waitUntil: 'domcontentloaded' });
              await waitHomeUseful(session.page);
              raw.push(await clickLatency(session, {
                label: target.label,
                sha: target.sha,
                profile: profile.name,
                viewport: profile.viewport.name,
                cache: 'warm',
                warmup,
                sample,
              }));
            }
          } finally {
            await session.context.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  const measured = raw.filter((row) => row.warmup !== true);
  const warmupRows = raw.filter((row) => row.warmup === true);

  const coldHome = measured.filter((row) => row.route === '/onboarding' && row.cache === 'cold');
  const warmHome = measured.filter((row) => row.route === '/onboarding' && row.cache === 'warm');
  const coldMedian = stats(coldHome.map((row) => row.usefulShellMs)).median;
  const warmMedian = stats(warmHome.map((row) => row.usefulShellMs)).median;
  const coldWarmProof = {
    coldHomeMedianMs: coldMedian,
    warmHomeMedianMs: warmMedian,
    ok: coldMedian != null && warmMedian != null && coldMedian > warmMedian,
  };

  const comparison = {};
  const scenarioKeys = [];
  for (const row of measured) {
    const key = `${row.profile}|${row.viewport}|${row.cache}|${row.route}`;
    scenarioKeys.push(key);
    if (!comparison[key]) comparison[key] = {};
    if (!comparison[key][row.label]) comparison[key][row.label] = [];
    comparison[key][row.label].push(row);
  }

  const table = {};
  for (const [key, byLabel] of Object.entries(comparison)) {
    table[key] = {};
    for (const [label, rows] of Object.entries(byLabel)) {
      table[key][label] = summarize(rows);
    }
  }

  const report = {
    meta,
    proofs,
    coldWarmProof,
    executionOrder,
    table,
    raw: measured,
    warmupExcludedCount: warmupRows.length,
    generatedAt: new Date().toISOString(),
  };

  const jsonPath = path.join(OUT_DIR, 'gate-e-bench.json');
  const csvPath = path.join(OUT_DIR, 'gate-e-bench.csv');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const csvHeaders = [
    'label', 'sha', 'profile', 'viewport', 'cache', 'sample', 'route',
    'ttfbMs', 'usefulShellMs', 'interactiveMs', 'checkoutReadyMs', 'lcpMs', 'cls',
    'inpMs', 'hydrationMs', 'longTaskMs', 'transferredBytes', 'transferredJsBytes',
    'queryishRequestCount', 'heapUsedBytes', 'interactionMs', 'dualNavLinks', 'dualNavHtmlBytes',
  ];
  const csvLines = [csvHeaders.join(',')];
  for (const row of measured) {
    csvLines.push([
      row.label, row.sha, row.profile, row.viewport, row.cache, row.sample, row.route,
      row.ttfbMs, row.usefulShellMs, row.interactiveMs, row.checkoutReadyMs, row.lcpMs, row.cls,
      row.inpMs, row.hydrationMs, row.longTaskMs, row.transferredBytes, row.transferredJsBytes,
      row.queryishRequestCount, row.heapUsedBytes, row.interactionMs,
      row.dualNav?.linkCount ?? '', row.dualNav?.htmlBytes ?? '',
    ].join(','));
  }
  fs.writeFileSync(csvPath, csvLines.join('\n'));

  if (!coldWarmProof.ok) {
    throw new Error(`Cold/warm proof failed: ${JSON.stringify(coldWarmProof)}`);
  }

  process.stdout.write(`${JSON.stringify({ jsonPath, csvPath, proofs, coldWarmProof, scenarios: Object.keys(table).length }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

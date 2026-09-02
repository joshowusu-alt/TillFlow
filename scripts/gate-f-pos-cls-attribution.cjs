/**
 * Gate F laboratory CLS attribution for direct /pos document loads.
 * Never Production. Never creates sales.
 *
 * GATE_E_POS_URL=http://127.0.0.1:6204 node scripts/gate-f-pos-cls-attribution.cjs
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const BASE_URL = process.env.GATE_E_POS_URL || process.env.BASE_URL || 'http://127.0.0.1:6204';
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL || 'owner@store.com';
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD || 'Pass1234!';
const OUT_DIR = process.env.OUT_DIR || path.join(process.cwd(), 'tmp', 'gate-f');

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '844x390', width: 844, height: 390 },
  { name: '568x320', width: 568, height: 320 },
  { name: '412x915', width: 412, height: 915 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x720', width: 1280, height: 720 },
];

function assertLabTarget(url) {
  const host = new URL(url).hostname.toLowerCase();
  if (host === 'tillflow.app' || host === 'www.tillflow.app' || host.endsWith('.tillflow.app')) {
    throw new Error('BLOCKED: Gate F attribution cannot target Production');
  }
}

function describeNode(node) {
  if (!node || node.nodeType !== 1) return { tag: '#text' };
  const el = node;
  const attrs = [];
  for (const name of ['id', 'data-pos-search-card', 'data-pos-cart-card', 'data-pos-checkout-card', 'data-pos-till-compact', 'data-pos-till-form', 'data-pos-checkout-collapsed', 'data-pos-empty-cart', 'data-pos-mobile-cart-bar', 'data-pos-deferred-loading', 'role', 'aria-label']) {
    const value = el.getAttribute?.(name);
    if (value) attrs.push(`${name}=${value}`);
  }
  return {
    tag: el.tagName.toLowerCase(),
    className: (el.className || '').toString().slice(0, 120),
    attrs,
    text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
  };
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.locator('input[name="email"]').fill(OWNER_EMAIL);
  await page.locator('input[name="password"]').fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/(pos|onboarding)/, { timeout: 120_000 });
}

const SAMPLES = Math.max(1, Number(process.env.GATE_F_SAMPLES || 5));

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const p75 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.75) - 1)];
  return {
    n: sorted.length,
    median: Math.round(median * 1000) / 1000,
    p75: Math.round(p75 * 1000) / 1000,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    range: Math.round((sorted[sorted.length - 1] - sorted[0]) * 1000) / 1000,
  };
}

async function measurePos(page) {
  await page.evaluate(() => {
    window.__tfCls = { shifts: [], cls: 0 };
  });
  await page.goto(`${BASE_URL}/pos`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.getByLabel(/search products/i).first().waitFor({ state: 'visible', timeout: 45_000 });
  await page.locator('[data-pos-till-compact="ready"], [data-checkout-till-state="ready"]').first().waitFor({ state: 'visible', timeout: 45_000 }).catch(() => null);
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const lab = window.__tfCls || { shifts: [], cls: 0 };
    const till = document.querySelector('[data-pos-till-compact], [data-pos-till-form], [data-checkout-till-state]');
    const checkout = document.querySelector('[data-pos-checkout-card]');
    const cart = document.querySelector('[data-pos-cart-card]');
    const search = document.querySelector('[data-pos-search-card]');
    const box = (el) => (el ? el.getBoundingClientRect().toJSON() : null);
    return {
      cls: Math.round(lab.cls * 1000) / 1000,
      shifts: lab.shifts,
      geometry: {
        search: box(search),
        cart: box(cart),
        checkout: box(checkout),
        till: box(till),
        header: box(document.querySelector('header, [role="banner"]')),
        viewport: { w: window.innerWidth, h: window.innerHeight },
      },
      flags: {
        tillCompact: document.querySelector('[data-pos-till-compact]')?.getAttribute('data-pos-till-compact') || null,
        tillForm: Boolean(document.querySelector('[data-pos-till-form]')),
        checkoutCollapsed: Boolean(document.querySelector('[data-pos-checkout-collapsed]')),
        checkoutFullHidden: (document.querySelector('[data-pos-checkout-full="true"]')?.className || '').includes('max-md:hidden'),
        paymentPanel: Boolean(document.querySelector('#pos-payment-panel')),
        desktopShortcut: Boolean(document.querySelector('[data-pos-desktop-shortcut]')),
        deferredHint: Boolean(document.querySelector('[data-pos-deferred-loading]')),
      },
    };
  });
}

async function main() {
  assertLabTarget(BASE_URL);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const reports = [];
  try {
    for (const viewport of VIEWPORTS) {
      const samples = [];
      let attribution = null;
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        serviceWorkers: 'block',
      });
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__tfCls = { shifts: [], cls: 0 };
        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.hadRecentInput) continue;
              window.__tfCls.cls += entry.value;
              const sources = [];
              for (const source of entry.sources || []) {
                const node = source.node;
                let desc = { tag: 'unknown' };
                if (node && node.nodeType === 1) {
                  const el = node;
                  desc = {
                    tag: el.tagName.toLowerCase(),
                    id: el.id || null,
                    className: (el.className || '').toString().slice(0, 160),
                    attrs: Array.from(el.attributes || [])
                      .filter((attr) => /^(id|data-pos|role|aria-)/.test(attr.name))
                      .map((attr) => `${attr.name}=${attr.value}`),
                    text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
                  };
                }
                sources.push({
                  previous: source.previousRect
                    ? { x: source.previousRect.x, y: source.previousRect.y, w: source.previousRect.width, h: source.previousRect.height }
                    : null,
                  current: source.currentRect
                    ? { x: source.currentRect.x, y: source.currentRect.y, w: source.currentRect.width, h: source.currentRect.height }
                    : null,
                  node: desc,
                });
              }
              window.__tfCls.shifts.push({
                value: Math.round(entry.value * 1000) / 1000,
                startTime: Math.round(entry.startTime),
                sources,
              });
            }
          }).observe({ type: 'layout-shift', buffered: true });
        } catch {
          // Chromium without sources
        }
      });
      await login(page);
      const measuredSamples = [];
      for (let i = 0; i < SAMPLES; i += 1) {
        const measured = await measurePos(page);
        samples.push(measured.cls);
        measuredSamples.push(measured);
      }
      const cls = stats(samples);
      attribution = measuredSamples.reduce((best, row) =>
        Math.abs(row.cls - cls.median) < Math.abs(best.cls - cls.median) ? row : best
      , measuredSamples[0]);
      const shot = path.join(OUT_DIR, `pos-${viewport.name}.png`);
      await page.screenshot({ path: shot, fullPage: false });
      reports.push({
        viewport: viewport.name,
        screenshot: path.relative(process.cwd(), shot).replace(/\\/g, '/'),
        cls,
        samples,
        attribution,
      });
      await context.close();
      process.stdout.write(`${viewport.name} median=${cls.median} p75=${cls.p75} range=${cls.min}-${cls.max}\n`);
    }
  } finally {
    await browser.close();
  }
  const out = path.join(OUT_DIR, 'pos-cls-attribution.json');
  fs.writeFileSync(out, JSON.stringify({ kind: 'laboratory', baseUrl: BASE_URL, samples: SAMPLES, reports }, null, 2));
  process.stdout.write(`${out}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

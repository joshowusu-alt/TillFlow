/** Read-only navigation regression against the job-local seeded app. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const baseURL = process.env.BASE_URL || 'http://localhost:6200';
assert(['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'Isolated local app only');
async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL, serviceWorkers: 'allow' });
  const page = await context.newPage();
  const documents = [];
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) documents.push(frame.url()); });
  const results = [];
  try {
    await page.goto('/login');
    await page.locator('input[name=email]').waitFor();
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), { timeout: 15_000 });
    assert.equal(documents.length, 1, 'First service-worker claim must not reload login');
    await page.locator('input[name=email]').fill(process.env.E2E_OWNER_EMAIL || 'owner@store.com');
    await page.locator('input[name=password]').fill(process.env.E2E_OWNER_PASSWORD || 'Pass1234!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'));
    await page.locator('#main-content h1').first().waitFor({ timeout: 30_000 });
    const destinations = [
      { group: null, href: '/onboarding' },
      { group: 'Stock', href: '/products' },
      { group: 'Stock', href: '/inventory' },
      { group: 'Stock', href: '/purchases' },
      { group: 'People', href: '/customers' },
      { group: null, href: '/reports' },
    ];
    for (const route of destinations) {
      if (route.group) await page.getByRole('button', { name: route.group, exact: true }).click();
      const start = Date.now();
      const link = page.locator(`nav a[href="${route.href}"], nav a[href^="${route.href}?"]`).first();
      await link.click();
      await page.waitForURL(url => url.pathname === route.href);
      await page.locator('#main-content h1').first().waitFor({ timeout: 30_000 });
      await page.locator('[aria-label="Preparing owner home"]').waitFor({ state: 'hidden', timeout: 30_000 });
      const elapsedMs = Date.now() - start;
      assert(elapsedMs < 15_000, `Navigation stalled on ${route.href}: ${elapsedMs}ms`);
      results.push({ route: route.href, usefulContentMs: elapsedMs, heading: await page.locator('#main-content h1').first().innerText() });
    }
    fs.mkdirSync('playwright/test-results', { recursive: true });
    fs.writeFileSync('playwright/test-results/app-loading.json', JSON.stringify({ firstWorkerClaimReloads: 0, results }, null, 2));
    console.log(JSON.stringify({ firstWorkerClaimReloads: 0, results }));
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

/**
 * Investigation probe: register a fresh Growth + Online Storefront add-on
 * business on production, then check merchant access to online store
 * settings, analytics, and online orders. Read-only beyond the registration.
 */
import { chromium } from 'playwright';

const BASE = 'https://www.tillflow.app';
const stamp = Date.now();
const email = `smoke.assess-growth-addon.${stamp}@tillflow-smoke.test`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
await page.getByPlaceholder('e.g. El-Shaddai Supermarket').fill('Assess Growth Addon');
await page.getByPlaceholder('e.g. Kingsley Atakorah').fill('Assess Tester');
await page.getByRole('button', { name: 'Next — Account Details' }).click();
await page.getByPlaceholder('you@yourstore.com').waitFor({ state: 'visible' });
await page.getByPlaceholder('you@yourstore.com').fill(email);
await page.getByPlaceholder('At least 6 characters').fill('SmokeTest1');
await page.getByRole('button', { name: 'Next — Choose Plan' }).click();
await page.getByText('Choose how you want to pay').waitFor({ state: 'visible' });
await page.getByRole('button', { name: /^Growth/i }).click();
await page.getByLabel(/Add online storefront/i).check();
await page.getByRole('button', { name: 'Next — Currency' }).click();
await page.getByRole('button', { name: 'Create My Business' }).click();
await page.waitForURL(/\/(welcome|onboarding|dashboard|pos|getting-started)/, { timeout: 90000 });
console.log('registered:', email);

const checks = [];
for (const path of ['/settings/online-store', '/settings/online-store/analytics', '/online-orders']) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  const body = await page.locator('body').innerText();
  checks.push({
    path,
    blockedNotice:
      body.includes('Online storefront requires Pro or Growth add-on') ||
      body.includes('Online orders need the storefront add-on'),
    bodyPreview: body.replace(/\s+/g, ' ').slice(0, 320),
  });
}

console.log(JSON.stringify(checks, null, 2));
await browser.close();

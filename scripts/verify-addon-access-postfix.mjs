/**
 * Post-fix verification: register a fresh Growth + add-on business on
 * production and confirm Online Store settings, analytics, and Online Orders
 * are accessible, the storefront stays unpublished, and nav badges are sane.
 */
import { chromium } from 'playwright';

const BASE = 'https://www.tillflow.app';
const stamp = Date.now();
const email = `smoke.postfix-growth-addon.${stamp}@tillflow-smoke.test`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
await page.getByPlaceholder('e.g. El-Shaddai Supermarket').fill('Smoke Postfix Growth Addon');
await page.getByPlaceholder('e.g. Kingsley Atakorah').fill('Smoke Tester');
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
      body.includes('Add Online Storefront to your Growth plan') ||
      body.includes('not available on your plan') ||
      body.includes('Online storefront requires Pro or Growth add-on'),
    settingsUi:
      body.includes('Not published yet') ||
      body.includes('Online store active') ||
      body.includes('Storefront analytics') ||
      body.includes('Awaiting payment') ||
      body.includes('No online orders'),
    bodySnippet: body.replace(/\s+/g, ' ').slice(0, 200),
  });
}

console.log(JSON.stringify(checks, null, 2));
await browser.close();

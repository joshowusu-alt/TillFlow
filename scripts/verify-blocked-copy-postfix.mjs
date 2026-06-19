/**
 * Post-fix verification: Growth WITHOUT add-on must still be blocked from the
 * storefront pages and see the new add-on upsell copy with a support CTA.
 */
import { chromium } from 'playwright';

const BASE = 'https://www.tillflow.app';
const stamp = Date.now();
const email = `smoke.postfix-growth-noaddon.${stamp}@tillflow-smoke.test`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
await page.getByPlaceholder('e.g. El-Shaddai Supermarket').fill('Smoke Postfix Growth NoAddon');
await page.getByPlaceholder('e.g. Kingsley Atakorah').fill('Smoke Tester');
await page.getByRole('button', { name: 'Next — Account Details' }).click();
await page.getByPlaceholder('you@yourstore.com').waitFor({ state: 'visible' });
await page.getByPlaceholder('you@yourstore.com').fill(email);
await page.getByPlaceholder('At least 6 characters').fill('SmokeTest1');
await page.getByRole('button', { name: 'Next — Choose Plan' }).click();
await page.getByText('Choose how you want to pay').waitFor({ state: 'visible' });
await page.getByRole('button', { name: /^Growth/i }).click();
await page.getByRole('button', { name: 'Next — Currency' }).click();
await page.getByRole('button', { name: 'Create My Business' }).click();
await page.waitForURL(/\/(welcome|onboarding|dashboard|pos|getting-started)/, { timeout: 90000 });
console.log('registered:', email);

await page.goto(`${BASE}/settings/online-store`, { waitUntil: 'networkidle' });
const body = await page.locator('body').innerText();
console.log(JSON.stringify({
  path: '/settings/online-store',
  upsellHeading: body.includes('Add Online Storefront to your Growth plan'),
  pickupLine: body.includes('Let customers browse products and place pickup orders online.'),
  priceLine: body.includes('Add it for GHS 200/month.'),
  supportCta: body.includes('Contact support to activate'),
  settingsUiLeaked: body.includes('Not published yet') || body.includes('Online store active'),
}, null, 2));
await browser.close();

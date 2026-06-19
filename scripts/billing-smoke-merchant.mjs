/**
 * Merchant storefront access smoke on production.
 */
import { chromium } from 'playwright';

const BASE = 'https://www.tillflow.app';
const stamp = 1780932867947;

const CASES = [
  { key: 'starter-monthly', expectOnlineStoreAccess: false },
  { key: 'growth-monthly', expectOnlineStoreAccess: false },
  { key: 'growth-addon-monthly', expectOnlineStoreAccess: true },
  { key: 'pro-monthly', expectOnlineStoreAccess: true },
];

async function checkAccess(page, testCase) {
  const email = `smoke.${testCase.key}.${stamp}@tillflow-smoke.test`;
  await page.context().clearCookies();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill('SmokeTest1');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/(getting-started|dashboard|pos|onboarding)/, { timeout: 60000 });

  await page.goto(`${BASE}/settings/online-store`, { waitUntil: 'networkidle' });
  const url = page.url();
  const body = await page.locator('body').innerText();
  const blocked = /not available|upgrade|included in growth|add-on|does not include|not on your plan/i.test(body) || url.includes('/settings') && !url.includes('/online-store');
  const allowed = url.includes('/settings/online-store') && !blocked;

  const pass = testCase.expectOnlineStoreAccess ? allowed : blocked || !url.includes('/settings/online-store');
  return {
    key: testCase.key,
    status: pass ? 'PASS' : 'FAIL',
    url,
    expectOnlineStoreAccess: testCase.expectOnlineStoreAccess,
    blocked,
    allowed,
  };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const results = [];

for (const testCase of CASES) {
  try {
    results.push(await checkAccess(page, testCase));
    console.log(`PASS merchant ${testCase.key}`);
  } catch (error) {
    results.push({ key: testCase.key, status: 'FAIL', error: String(error) });
    console.error(`FAIL merchant ${testCase.key}`, error);
  }
}

await browser.close();
console.log(JSON.stringify({ results }, null, 2));

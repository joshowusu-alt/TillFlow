/**
 * Post-deploy billing smoke registrations on production TillFlow.
 * Usage: node scripts/billing-smoke-register.mjs
 */
import { chromium } from 'playwright';

const BASE = 'https://www.tillflow.app';
const stamp = Date.now();

const SCENARIOS = [
  { key: 'starter-monthly', businessName: 'Smoke Starter Monthly', plan: 'Starter', billing: 'Monthly', addon: false, expectTotal: 'GHS 199/month' },
  { key: 'starter-annual', businessName: 'Smoke Starter Annual', plan: 'Starter', billing: 'Annual', addon: false, expectTotal: 'GHS 1,990/year', expectSave: 'GHS 398' },
  { key: 'growth-monthly', businessName: 'Smoke Growth Monthly', plan: 'Growth', billing: 'Monthly', addon: false, expectTotal: 'GHS 349/month' },
  { key: 'growth-annual', businessName: 'Smoke Growth Annual', plan: 'Growth', billing: 'Annual', addon: false, expectTotal: 'GHS 3,490/year', expectSave: 'GHS 698' },
  { key: 'growth-addon-monthly', businessName: 'Smoke Growth Addon Monthly', plan: 'Growth', billing: 'Monthly', addon: true, expectTotal: 'GHS 549/month' },
  { key: 'growth-addon-annual', businessName: 'Smoke Growth Addon Annual', plan: 'Growth', billing: 'Annual', addon: true, expectTotal: 'GHS 5,490/year', expectSave: 'GHS 1,098' },
  { key: 'pro-monthly', businessName: 'Smoke Pro Monthly', plan: 'Pro', billing: 'Monthly', addon: false, expectTotal: 'GHS 699/month' },
  { key: 'pro-annual', businessName: 'Smoke Pro Annual', plan: 'Pro', billing: 'Annual', addon: false, expectTotal: 'GHS 6,990/year', expectSave: 'GHS 1,398' },
];

async function registerScenario(page, scenario) {
  const email = `smoke.${scenario.key}.${stamp}@tillflow-smoke.test`;
  const password = 'SmokeTest1';

  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('e.g. El-Shaddai Supermarket').fill(scenario.businessName);
  await page.getByPlaceholder('e.g. Kingsley Atakorah').fill('Smoke Tester');
  await page.getByRole('button', { name: 'Next — Account Details' }).click();
  await page.getByPlaceholder('you@yourstore.com').waitFor({ state: 'visible' });

  await page.getByPlaceholder('you@yourstore.com').fill(email);
  await page.getByPlaceholder('At least 6 characters').fill(password);
  await page.getByRole('button', { name: 'Next — Choose Plan' }).click();
  await page.getByText('Choose how you want to pay').waitFor({ state: 'visible' });

  await page.getByRole('button', { name: new RegExp(`^${scenario.plan}`, 'i') }).click();
  if (scenario.billing === 'Annual') {
    await page.getByRole('button', { name: 'Annual' }).click();
  }
  if (scenario.addon) {
    await page.getByLabel(/Add online storefront/i).check();
  }

  const summary = await page.locator('.rounded-xl.border.border-black\\/8.bg-white\\/90').last().innerText();
  if (!summary.includes(scenario.expectTotal.replace('/month', '').replace('/year', ''))) {
    throw new Error(`Pricing mismatch for ${scenario.key}. Expected ${scenario.expectTotal}. Got:\n${summary}`);
  }
  if (scenario.expectSave && !summary.includes(scenario.expectSave)) {
    throw new Error(`Savings mismatch for ${scenario.key}. Expected ${scenario.expectSave}. Got:\n${summary}`);
  }

  await page.getByRole('button', { name: 'Next — Currency' }).click();
  await page.getByRole('button', { name: 'Create My Business' }).click();
  await page.waitForURL(/\/(welcome|onboarding|dashboard|pos|getting-started)/, { timeout: 90000 });

  return { email, password, summarySnippet: summary.split('\n').slice(-3).join(' | ') };
}

async function logout(page) {
  await page.context().clearCookies();
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const uiResults = [];

for (const scenario of SCENARIOS) {
  try {
    const result = await registerScenario(page, scenario);
    uiResults.push({ scenario: scenario.key, status: 'PASS', ...result });
    console.log(`PASS register ${scenario.key}`);
    await logout(page);
  } catch (error) {
    uiResults.push({ scenario: scenario.key, status: 'FAIL', error: error instanceof Error ? error.message : String(error) });
    console.error(`FAIL register ${scenario.key}:`, error);
  }
}

await browser.close();
console.log(JSON.stringify({ uiResults }, null, 2));

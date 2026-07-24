/**
 * Authenticated owner/manager/cashier smoke against Preview URL.
 */
import { chromium } from 'playwright';

const BASE_URL = (process.env.PREVIEW_BASE_URL || '').replace(/\/$/, '');
if (!BASE_URL) {
  console.error('PREVIEW_BASE_URL required');
  process.exit(2);
}

const roles = [
  {
    name: 'owner',
    email: 'perf.elshaddai@tillflow-test.invalid',
    password: 'PerfQa99!',
    expectPath: /\/(reports\/dashboard|getting-started|onboarding|pos)/i,
    canMigration: true,
  },
  {
    name: 'manager',
    email: 'perf.manager@tillflow-test.invalid',
    password: 'PerfQa99!',
    expectPath: /\/(pos|reports|products|getting-started)/i,
    canMigration: true,
  },
  {
    name: 'cashier',
    email: 'perf.cashier@tillflow-test.invalid',
    password: 'PerfQa99!',
    expectPath: /\/(pos|my-sales|shifts)/i,
    canMigration: false,
  },
];

const browser = await chromium.launch({ headless: true });
const results = [];

for (const role of roles) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const entry = { role: role.name, ok: false };
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 60000 });
    const email = page.locator('input[name="email"], input[type="email"]').first();
    const password = page.locator('input[name="password"], input[type="password"]').first();
    await email.waitFor({ timeout: 30000 });
    await email.fill(role.email);
    await password.fill(role.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), null, {
      timeout: 45000,
    });
    entry.landed = page.url();
    entry.pathOk = role.expectPath.test(new URL(page.url()).pathname);

    await page.goto(`${BASE_URL}/settings/migration`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1500);
    const migUrl = page.url();
    const body = await page.locator('body').innerText();
    const onMigration = /migration|source system|catalogue|opening stock/i.test(body);
    const denied = /not authorized|forbidden|sign in|access denied/i.test(body) || migUrl.includes('/login');
    entry.migrationUrl = migUrl;
    entry.migrationAccess = role.canMigration ? onMigration && !denied : denied || !onMigration || /pos/i.test(migUrl);
    entry.ok = entry.pathOk && entry.migrationAccess;
    await page.screenshot({ path: `tmp/preview-mig-role-${role.name}.png` });
  } catch (e) {
    entry.error = e.message;
  } finally {
    results.push(entry);
    console.log(JSON.stringify(entry));
    await context.close();
  }
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
process.exit(failed.length ? 1 : 0);

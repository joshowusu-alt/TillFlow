/**
 * Production import smoke via Playwright (browser-equivalent).
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, 'signoff-import-min.csv');
const base = 'https://supermarket-pos-five.vercel.app';
const email = process.env.SIGNOFF_EMAIL ?? 'adomtestmart.rehearsal.20260603@tillflow-test.invalid';
const password = process.env.SIGNOFF_PASSWORD ?? 'RehearseTest99!';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 90000 });

  await page.goto(`${base}/settings/import-stock`, { waitUntil: 'networkidle', timeout: 60000 });
  const input = page.locator('[data-testid="import-stock-file-input"]');
  await input.setInputFiles(csvPath);

  await page.waitForTimeout(3000);
  const bodyText = await page.locator('body').innerText();
  const hasPreview =
    bodyText.includes('Review') ||
    bodyText.includes('Signoff Import') ||
    bodyText.includes('preview') ||
    bodyText.includes('Confirm import');
  const hasErrorOnly = bodyText.includes('failed') && !hasPreview;

  let confirmed = false;
  if (hasPreview) {
    const confirmBtn = page.getByRole('button', { name: /confirm import|import now|confirm/i });
    if ((await confirmBtn.count()) > 0) {
      await confirmBtn.first().click();
      await page.waitForTimeout(8000);
      confirmed = true;
    }
  }

  const finalText = await page.locator('body').innerText();
  const success =
    finalText.includes('imported') ||
    finalText.includes('Import complete') ||
    finalText.includes('Done') ||
    finalText.includes('created');

  console.log(
    JSON.stringify(
      {
        hasPreview,
        confirmed,
        success,
        snippet: finalText.slice(0, 500),
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}

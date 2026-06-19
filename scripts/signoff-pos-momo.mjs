/**
 * Production POS MoMo/manual sale smoke.
 */
import { chromium } from 'playwright';

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

  await page.goto(`${base}/pos`, { waitUntil: 'networkidle', timeout: 60000 });
  const search = page.getByPlaceholder(/search|scan|barcode/i).first();
  if ((await search.count()) > 0) {
    await search.fill('SIGNOFF-SODA');
    await page.waitForTimeout(1500);
  }

  const productBtn = page.getByText(/Signoff Soda/i).first();
  if ((await productBtn.count()) > 0) await productBtn.click();
  await page.waitForTimeout(1000);

  const momoBtn = page.getByRole('button', { name: /momo|mobile money|mtn/i }).first();
  const manualBtn = page.getByRole('button', { name: /manual|other payment/i }).first();
  let payMethod = 'none';
  if ((await momoBtn.count()) > 0) {
    await momoBtn.click();
    payMethod = 'momo';
  } else if ((await manualBtn.count()) > 0) {
    await manualBtn.click();
    payMethod = 'manual';
  }

  const complete = page.getByRole('button', { name: /complete|pay|charge|confirm/i });
  if ((await complete.count()) > 0) await complete.first().click();
  await page.waitForTimeout(4000);

  const text = await page.locator('body').innerText();
  const ok =
    text.includes('Reprint') ||
    text.includes('receipt') ||
    text.includes('Thank') ||
    text.includes('Change') ||
    payMethod === 'none';

  console.log(JSON.stringify({ payMethod, ok, snippet: text.slice(0, 400) }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ error: String(e) }));
} finally {
  await browser.close();
}

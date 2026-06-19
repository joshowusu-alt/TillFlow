/**
 * Demo storefront checkout smoke (/demo/store).
 */
import { chromium } from 'playwright';

const base = 'https://supermarket-pos-five.vercel.app/demo/store';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
try {
  await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });

  const search = page.getByPlaceholder(/search/i).first();
  if ((await search.count()) > 0) {
    await search.fill('sample');
    await page.waitForTimeout(800);
  }

  const cat = page.getByRole('button', { name: /drinks|grocery|all/i }).first();
  if ((await cat.count()) > 0) await cat.click();

  const add = page.getByRole('button', { name: /add to cart|add/i }).first();
  if ((await add.count()) > 0) await add.click();
  await page.waitForTimeout(500);

  const cart = page.getByRole('link', { name: /cart|checkout/i }).or(page.getByRole('button', { name: /cart|checkout/i }));
  if ((await cart.count()) > 0) await cart.first().click();
  await page.waitForTimeout(1000);

  const checkout = page.getByRole('button', { name: /checkout|place order|continue/i }).first();
  if ((await checkout.count()) > 0) await checkout.click();

  await page.waitForTimeout(2000);
  const text = await page.locator('body').innerText();
  const ok =
    text.includes('order') ||
    text.includes('payment') ||
    text.includes('confirm') ||
    text.includes('sample') ||
    text.includes('checkout');

  console.log(JSON.stringify({ url: page.url(), ok, snippet: text.slice(0, 500) }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ error: String(e) }));
} finally {
  await browser.close();
}

import { expect, type Page } from '@playwright/test';

export async function expectNoHorizontalOverflow(page: Page, tolerance = 2) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + tolerance);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth + tolerance);
}

export async function focusFirstSearchInput(page: Page) {
  const search = page.locator('input[type="search"]').first();
  if ((await search.count()) === 0) return false;
  await search.click();
  await search.fill('a');
  await page.waitForTimeout(300);
  return true;
}

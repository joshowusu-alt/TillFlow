import type { Page } from '@playwright/test';

/**
 * Select an authorised header branch the way a real user would.
 * Does not inject Store A or write the operational-store cookie directly.
 */
export async function selectAuthorisedOperationalStore(page: Page) {
  const search = page.getByLabel(/search products/i).or(page.locator('input[type="search"]')).first();
  if (await search.isVisible().catch(() => false)) return;

  const switcher = page.locator('#operational-store-switcher');
  if ((await switcher.count()) === 0) return;

  const optionValues = await switcher.locator('option').evaluateAll((options) =>
    options
      .map((option) => (option as HTMLOptionElement).value)
      .filter((value) => value && value !== 'ALL'),
  );
  const current = await switcher.inputValue().catch(() => '');
  const next = optionValues.find((value) => value && value !== current) ?? optionValues[0];
  if (!next) return;
  if (next !== current) {
    await switcher.selectOption(next);
    await page.locator('#main-content').waitFor({ state: 'visible' });
  }
}

export async function expectPosSearchReady(page: Page) {
  await selectAuthorisedOperationalStore(page);
  await page
    .getByLabel(/search products/i)
    .or(page.locator('input[type="search"]'))
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 });
}

/**
 * Reliability journey scaffold: register → tills → product → Till 3 →
 * open → cash / card / momo / transfer / split → close.
 *
 * Skipped unless RELIABILITY_E2E=1 or a Preview base URL + owner creds exist.
 * Never runs against Production. Completing sales also requires
 * PLAYWRIGHT_ALLOW_QA_SALE=true (except local RELIABILITY_E2E=1).
 */
import { expect, test, type Page } from '@playwright/test';
import {
  hasRoleCredentials,
  reliabilityJourneySkipReason,
  reliabilitySalesAllowed,
  shouldRunReliabilityJourney,
} from '../tests/e2e/helpers/env';
import { loginAsRole, waitForProtectedShell } from '../tests/e2e/helpers/login';

const PRODUCT_NAME = 'Reliability SKU';

async function clearRestoredCart(page: Page) {
  const clear = page.getByRole('button', { name: /clear all/i });
  if ((await clear.count()) > 0) {
    await clear.first().click().catch(() => undefined);
    await expect(page.getByText(/Cart\s*0|This till is clear/i).first())
      .toBeVisible({ timeout: 10_000 })
      .catch(() => undefined);
  }
}

async function gotoPos(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }
  });
  await page.goto('/pos', { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByPlaceholder(/scan barcode/i)).toBeVisible({ timeout: 45_000 });
  await clearRestoredCart(page);
}

async function addJourneyProduct(page: Page) {
  const search = page.getByPlaceholder(/type product name/i);
  await search.click();
  await search.fill(PRODUCT_NAME);
  const result = page.locator('button:not([disabled])').filter({ hasText: new RegExp(PRODUCT_NAME, 'i') }).first();
  await expect(result).toBeVisible({ timeout: 20_000 });
  await result.click();
}

async function completeSaleAndReset(page: Page, completeName: RegExp) {
  const complete = page.getByRole('button', { name: completeName }).first();
  await expect(complete).toBeEnabled({ timeout: 15_000 });
  await complete.click();
  await expect(page.getByText(/Sale Complete|Ready for next customer/i).first()).toBeVisible({
    timeout: 30_000,
  });
  await clearRestoredCart(page);
}

test.describe('Reliability journey', () => {
  test.skip(!shouldRunReliabilityJourney(), reliabilityJourneySkipReason());

  test('register, three tills, product, Till 3 tenders, close', async ({ page }) => {
    test.setTimeout(240_000);

    await test.step('register or sign in (never Production)', async () => {
      if (process.env.RELIABILITY_E2E === '1' && !hasRoleCredentials('owner')) {
        const stamp = Date.now();
        await page.goto('/register', { waitUntil: 'domcontentloaded' });
        await page.getByPlaceholder(/El-Shaddai Supermarket/i).fill(`Reliability ${stamp}`);
        await page.getByPlaceholder(/Kingsley Atakorah/i).fill('Reliability Owner');
        await page.getByRole('button', { name: /Next — Account Details/i }).click();
        await page.getByPlaceholder(/you@yourstore.com/i).fill(`reliability-${stamp}@example.com`);
        await page.getByPlaceholder(/At least 6 characters/i).fill('Pass1234!');
        await page.getByRole('button', { name: /Next — Choose Plan/i }).click();
        await page.getByRole('button', { name: /Next — Currency/i }).click();
        await page.getByRole('button', { name: /Create My Business/i }).click();
        await waitForProtectedShell(page);
        return;
      }

      await loginAsRole(page, 'owner');
      await waitForProtectedShell(page);
    });

    await test.step('ensure two default tills and add Till 3', async () => {
      await page.goto('/settings?section=tills', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Till Management')).toBeVisible({ timeout: 30_000 });
      const till3 = page.getByText('Till 3', { exact: true });
      if ((await till3.count()) === 0) {
        await page.getByPlaceholder(/New till name e\.g\. Till 3/i).fill('Till 3');
        await page.getByRole('button', { name: /Add till/i }).click();
        await expect(page.getByText('Till 3', { exact: true })).toBeVisible({ timeout: 20_000 });
      }
    });

    await test.step('create sellable product', async () => {
      await page.goto('/products#product-create', { waitUntil: 'domcontentloaded' });
      const addProduct = page.getByText('Add product', { exact: true }).first();
      await expect(addProduct).toBeVisible({ timeout: 30_000 });
      const nameInput = page.locator('input[name="name"]').first();
      if (!(await nameInput.isVisible().catch(() => false))) {
        await page.locator('#product-create').click();
      }
      if ((await page.getByText(PRODUCT_NAME, { exact: true }).count()) === 0) {
        await page.locator('input[name="name"]').first().fill(PRODUCT_NAME);
        await page.locator('input[name="sellingPriceBasePence"]').fill('5.00');
        await page.locator('input[name="defaultCostBasePence"]').fill('2.00');
        await page.getByRole('button', { name: /Create product/i }).click();
        await expect(page.getByText(PRODUCT_NAME).first()).toBeVisible({ timeout: 30_000 });
      }
    });

    await test.step('open Till 3', async () => {
      await page.goto('/shifts', { waitUntil: 'domcontentloaded' });
      const tillSelect = page.locator('select').first();
      await expect(tillSelect).toBeVisible({ timeout: 30_000 });
      const till3Value = await tillSelect.locator('option', { hasText: /Till 3/i }).first().getAttribute('value');
      if (!till3Value) throw new Error('Till 3 is not available on /shifts');
      await tillSelect.selectOption(till3Value);
      await page.getByPlaceholder('0.00').fill('100');
      await page.getByRole('button', { name: /Open Shift/i }).click();
      await expect(page.getByText(/Shift Active|Till 3/i).first()).toBeVisible({ timeout: 30_000 });
    });

    await test.step('cash / card / momo / transfer / split on Till 3', async () => {
      test.skip(
        !reliabilitySalesAllowed(),
        'Sale completion skipped: set PLAYWRIGHT_ALLOW_QA_SALE=true and PLAYWRIGHT_QA_TENANT_CONFIRMED=true (never on Production).',
      );

      await page.goto('/pos', { waitUntil: 'domcontentloaded' });
      const tillLink = page.getByRole('link', { name: /Till 3/i }).or(page.getByRole('button', { name: /Till 3/i }));
      if ((await tillLink.count()) > 0) {
        await tillLink.first().click().catch(() => undefined);
      }
      await gotoPos(page);

      await addJourneyProduct(page);
      await expect(page.getByRole('button', { name: 'Cash', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await completeSaleAndReset(page, /Complete Cash Sale/i);

      for (const method of [
        { button: 'Card', ref: /card ref/i, value: 'CARD-REL-1' },
        { button: 'MoMo', ref: /transaction ref/i, value: 'MOMO-REL-1' },
        { button: 'Bank Transfer', ref: /transfer ref/i, value: 'BT-REL-1' },
      ] as const) {
        await addJourneyProduct(page);
        await page.getByRole('button', { name: method.button, exact: true }).click();
        await expect(page.getByRole('button', { name: method.button, exact: true })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await page.getByPlaceholder(method.ref).fill(method.value);
        await completeSaleAndReset(page, /Complete Sale/i);
      }

      await addJourneyProduct(page);
      await page.getByRole('button', { name: 'Split…' }).click();
      await expect(page.getByRole('button', { name: 'Split…' })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: 'Cash', exact: true }).click();
      await page.getByRole('button', { name: 'Card', exact: true }).click();
      await completeSaleAndReset(page, /Complete Sale/i);
    });

    await test.step('close Till 3 shift', async () => {
      await page.goto('/shifts', { waitUntil: 'domcontentloaded' });
      const close = page.getByRole('button', { name: /Close Shift/i }).first();
      if ((await close.count()) === 0) {
        test.info().annotations.push({
          type: 'gap',
          description: 'No open shift close control visible — close may already have happened.',
        });
        return;
      }
      await close.click();
      const actualCash = page.getByLabel(/actual cash|counted cash/i).or(page.locator('input[type="number"]').nth(1));
      if ((await actualCash.count()) > 0) {
        await actualCash.first().fill('100');
      }
      const confirm = page.getByRole('button', { name: /Close Shift/i }).last();
      await confirm.click();
    });
  });
});

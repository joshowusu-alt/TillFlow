import { expect, test, type Page } from '@playwright/test';

async function clearRestoredCart(page: Page) {
  const clear = page.getByRole('button', { name: /clear all/i });
  if ((await clear.count()) > 0) {
    await clear.first().click().catch(() => undefined);
  }
  const cartBar = page.locator('[data-pos-mobile-cart-bar="true"]');
  if (await cartBar.isVisible().catch(() => false)) {
    await cartBar.getByRole('button', { name: /View cart/i }).click();
    const sheetClear = page.getByRole('dialog').getByRole('button', { name: /clear all/i });
    if (await sheetClear.isVisible().catch(() => false)) {
      page.once('dialog', (dialog) => dialog.accept());
      await sheetClear.click();
    }
    await page.getByRole('button', { name: /Close cart and checkout/i }).click().catch(() => undefined);
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

async function addPerfSku(page: Page) {
  const search = page.getByPlaceholder(/type product name/i);
  await search.click();
  await search.fill('Perf SKU');
  const result = page.locator('button:not([disabled])').filter({ hasText: /Perf SKU/i }).first();
  await expect(result).toBeVisible({ timeout: 20_000 });
  await result.click();
}

test.describe('POS mobile Phase 2 cart bar + sheet', () => {
  test.use({
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE ?? 'playwright/.auth/owner.json',
  });

  for (const viewport of [
    { name: 'phone-390', width: 390, height: 844, phone: true },
    { name: 'phone-430', width: 430, height: 932, phone: true },
    { name: 'phone-767', width: 767, height: 900, phone: true },
    { name: 'tablet-768', width: 768, height: 1024, phone: false },
    { name: 'desktop-1366', width: 1366, height: 768, phone: false },
  ]) {
    test(`cart bar / sheet boundary @ ${viewport.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await gotoPos(page);

      if (viewport.phone) {
        await expect(page.locator('[data-pos-mobile-cart-bar="true"]')).toHaveCount(0);
        await expect(page.locator('[data-pos-checkout-collapsed="true"]')).toBeVisible();
        await expect(page.getByRole('button', { name: /F2 focus barcode/i })).toHaveCount(0);

        await addPerfSku(page);
        await expect(page.locator('[data-pos-mobile-cart-bar="true"]')).toBeVisible();
        await expect(page.locator('[data-pos-cart-card="true"]')).toHaveCount(0);
        await expect(page.locator('#pos-payment-panel')).toHaveCount(0);

        await page.getByRole('button', { name: /View cart/i }).click();
        const dialog = page.getByRole('dialog', { name: /Cart & checkout/i });
        await expect(dialog).toBeVisible();
        await expect(page.getByLabel(/payment status/i)).toHaveValue('PAID');
        await expect(page.getByRole('button', { name: 'Cash', exact: true })).toHaveAttribute(
          'aria-pressed',
          'true',
        );

        await page.getByRole('button', { name: 'MoMo', exact: true }).click();
        await expect(page.getByRole('button', { name: 'MoMo', exact: true })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await expect(page.getByRole('button', { name: 'Cash', exact: true })).toHaveAttribute(
          'aria-pressed',
          'false',
        );

        await page.getByRole('button', { name: /Close cart and checkout/i }).click();
        await expect(dialog).toHaveCount(0);
        await expect(page.locator('[data-pos-mobile-cart-bar="true"]')).toBeVisible();
        await expect(page.locator('#pos-payment-panel')).toHaveCount(0);

        await page.getByRole('button', { name: /View cart/i }).click();
        await expect(page.getByRole('button', { name: 'MoMo', exact: true })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
      } else {
        await addPerfSku(page);
        await expect(page.locator('[data-pos-mobile-cart-bar="true"]')).toHaveCount(0);
        await expect(page.getByRole('dialog', { name: /Cart & checkout/i })).toHaveCount(0);
        await expect(page.locator('#pos-payment-panel')).toBeVisible();
        await expect(page.locator('[data-pos-cart-card="true"]')).toBeVisible();
        if (viewport.width >= 768 && viewport.width < 1024) {
          // Tablet retains denser chrome including F2 on empty; after add, inline checkout remains.
          await expect(page.getByLabel(/payment status/i)).toHaveValue('PAID');
        }
        if (viewport.width >= 1366) {
          await expect(page.getByLabel('Keyboard help')).toBeVisible();
        }
      }

      await page.screenshot({
        path: testInfo.outputPath(`phase2-${viewport.name}.png`),
        fullPage: true,
      });
    });
  }
});

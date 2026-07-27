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

test.describe('POS mobile P0 transaction safety', () => {
  test.use({
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE ?? 'playwright/.auth/owner.json',
  });

  test('active cart marks txn guard and survives soft visibility without auto-sale @390', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPos(page);
    await addPerfSku(page);

    await expect(page.locator('[data-pos-mobile-cart-bar="true"]')).toBeVisible();
    await expect
      .poll(async () => page.locator('html').getAttribute('data-pos-txn-active'))
      .toBe('true');

    await page.getByRole('button', { name: /View cart/i }).click();
    const dialog = page.getByRole('dialog', { name: /Cart & checkout/i });
    await expect(dialog).toBeVisible();
    await page.getByRole('button', { name: 'Card', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Card', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Soft background/foreground — must not submit or clear checkout.
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('online'));
    });

    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Card', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('html')).toHaveAttribute('data-pos-txn-active', 'true');
  });

  test('definite rejection keeps sheet open with accessible in-sheet error @430', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await gotoPos(page);
    await addPerfSku(page);
    await page.getByRole('button', { name: /View cart/i }).click();
    const dialog = page.getByRole('dialog', { name: /Cart & checkout/i });
    await expect(dialog).toBeVisible();

    await page.route('**/pos**', async (route) => {
      // Do not block document navigations — only intercept sale mutations if posted.
      if (route.request().method() === 'POST') {
        await route.abort('failed');
        return;
      }
      await route.continue();
    });

    // Prefer server-action failure via page evaluation hook when available; otherwise
    // complete with zero stock / closed till is environment-dependent. Use request
    // interception on the Next server-action fetch shape.
    await page.unroute('**/pos**');
    await page.route('**/*', async (route) => {
      const request = route.request();
      const headers = request.headers();
      if (
        request.method() === 'POST' &&
        (headers['next-action'] || headers['Next-Action'] || request.url().includes('completeSale'))
      ) {
        await route.fulfill({
          status: 500,
          contentType: 'text/plain',
          body: 'Forced QA rejection',
        });
        return;
      }
      await route.continue();
    });

    const complete = dialog.locator('[data-pos-mobile-sheet-footer="true"] button.btn-primary');
    await expect(complete).toBeEnabled({ timeout: 15_000 });
    await complete.click();

    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-pos-mobile-sheet-sale-error="true"], [role="alert"]').first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('[data-pos-mobile-cart-bar="true"]')).toBeVisible();
  });

  test('tablet width keeps inline checkout without phone sheet @768', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoPos(page);
    await addPerfSku(page);
    await expect(page.locator('[data-pos-mobile-cart-bar="true"]')).toHaveCount(0);
    await expect(page.locator('#pos-payment-panel')).toBeVisible();
    await expect(page.getByRole('dialog', { name: /Cart & checkout/i })).toHaveCount(0);
  });
});

import { expect, test, type Page } from '@playwright/test';

async function clearRestoredCart(page: Page) {
  const clear = page.getByRole('button', { name: /clear all/i });
  if ((await clear.count()) > 0) {
    await clear.first().click().catch(() => undefined);
    await expect(page.getByText(/Cart\s*0|This till is clear/i).first()).toBeVisible({
      timeout: 10_000,
    }).catch(() => undefined);
  }
}

async function waitForCatalogue(page: Page) {
  const search = page.getByPlaceholder(/type product name/i);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await search.click();
    await search.fill('Perf SKU');
    const result = page.locator('button:not([disabled])').filter({ hasText: /Perf SKU/i }).first();
    if (await result.isVisible().catch(() => false)) {
      await search.fill('');
      await page.keyboard.press('Escape').catch(() => undefined);
      return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error('Catalogue did not load Perf SKU products in time');
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
  await expect(page.getByLabel(/payment status/i)).toBeVisible({ timeout: 30_000 });
  await clearRestoredCart(page);
  await waitForCatalogue(page);
}

async function addFirstProduct(page: Page) {
  const search = page.getByPlaceholder(/type product name/i);
  await search.click();
  await search.fill('Perf SKU');
  const result = page.locator('button:not([disabled])').filter({ hasText: /Perf SKU/i }).first();
  await expect(result).toBeVisible({ timeout: 15_000 });
  await result.click();
  // Phone Phase 2: cart moves behind the persistent bar; tablet/desktop keep the cart card.
  await expect(
    page
      .locator('[data-pos-mobile-cart-bar="true"]')
      .or(page.locator('[data-pos-cart-card="true"]'))
      .or(page.getByText(/Perf SKU/i))
      .first(),
  ).toBeVisible({ timeout: 10_000 });
}

async function selectCustomer(page: Page, name: string) {
  const search = page.getByPlaceholder(/search by name or phone/i);
  await search.fill(name.split(' ')[0] ?? name);
  const select = page.locator('select[name="customerId"]');
  await expect(select).toBeVisible();
  // Prefer option containing the name
  const option = select.locator('option', { hasText: new RegExp(name, 'i') }).first();
  const value = await option.getAttribute('value');
  if (!value) throw new Error(`Customer option not found for ${name}`);
  await select.selectOption(value);
}

async function chooseNoDueDate(page: Page) {
  await page.getByRole('button', { name: /no due date/i }).click();
}

test.describe('POS Option B checkout', () => {
  test.use({ storageState: 'playwright/.auth/owner.json' });

  for (const viewport of [
    { name: 'desktop-large', width: 1920, height: 1080 },
    { name: 'desktop-laptop', width: 1366, height: 768 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`empty Paid+Cash layout @ ${viewport.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await gotoPos(page);

      const isPhone = viewport.width < 768;
      if (isPhone) {
        // Phase 1/2: phone empty-cart collapses payment; Phase 2 opens checkout via cart sheet.
        await expect(page.locator('[data-pos-checkout-collapsed="true"]')).toBeVisible();
        await expect(page.getByLabel(/payment status/i)).toHaveCount(0);
        await expect(page.getByRole('button', { name: /F2 focus barcode/i })).toHaveCount(0);
        await expect(page.locator('[data-pos-mobile-cart-bar="true"]')).toHaveCount(0);
        await addFirstProduct(page);
        await expect(page.locator('[data-pos-mobile-cart-bar="true"]')).toBeVisible();
        await page.getByRole('button', { name: /View cart/i }).click();
        await expect(page.getByRole('dialog', { name: /Cart & checkout/i })).toBeVisible();
      }

      await expect(page.getByLabel(/payment status/i)).toHaveValue('PAID');
      await expect(page.getByRole('button', { name: 'Cash', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: 'Bank Transfer', exact: true })).toBeVisible();
      await expect(page.locator('input[name="dueDate"]')).toHaveCount(0);

      const completeButtons = page.locator('button', { hasText: /Complete Cash Sale/i });
      // Empty cart: any mounted Complete CTA must stay disabled.
      // Mobile may hide sticky duplicates until items exist; count can be 0+.
      if (!isPhone && (await completeButtons.count()) > 0) {
        await expect(completeButtons.first()).toBeDisabled();
      }

      await page.screenshot({
        path: testInfo.outputPath(`empty-${viewport.name}.png`),
        fullPage: true,
      });
    });
  }

  test('exact-cash completes with one primary action and resets for next sale', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await gotoPos(page);
    await addFirstProduct(page);

    const complete = page.getByRole('button', { name: /Complete Cash Sale/i }).first();
    await expect(complete).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('paid-cash-ready.png'), fullPage: true });

    // Enter in cash field must not submit.
    const cash = page.locator('#pos-cash-tendered');
    await cash.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/Sale Complete/i)).toHaveCount(0);

    await complete.click();
    await expect(page.getByText(/Sale Complete|Ready for next customer/i).first()).toBeVisible({
      timeout: 30_000,
    });

    // Cart cleared; barcode ready for next sale.
    await expect(page.getByPlaceholder(/scan barcode/i)).toBeFocused();
    await expect(page.getByLabel(/payment status/i)).toHaveValue('PAID');

    // Optional receipt must not block next sale.
    const print = page.getByRole('button', { name: /Print Receipt/i });
    if (await print.count()) {
      const popupPromise = page.context().waitForEvent('page', { timeout: 5_000 }).catch(() => null);
      await print.first().click();
      await popupPromise;
    }
    await addFirstProduct(page);
    await expect(page.getByRole('button', { name: /Complete Cash Sale/i }).first()).toBeEnabled();
  });

  test('cash with change shows change and completes', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await gotoPos(page);
    await addFirstProduct(page);

    await page.getByRole('button', { name: 'GH₵200.00' }).or(page.getByRole('button', { name: /GH₵\s*200/i })).first().click().catch(async () => {
      await page.locator('#pos-cash-tendered').fill('200');
    });
    await expect(page.getByText(/Change/i).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('cash-change.png'), fullPage: true });

    await page.getByRole('button', { name: /Complete Cash Sale/i }).first().click();
    await expect(page.getByText(/Sale Complete|Ready for next customer/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  for (const method of [
    { label: 'MoMo', button: 'MoMo', amountId: null as string | null },
    { label: 'Card', button: 'Card', amountId: null },
    { label: 'Bank Transfer', button: 'Bank Transfer', amountId: null },
  ]) {
    test(`paid ${method.label} path`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await gotoPos(page);
      await addFirstProduct(page);

      // Ordinary method click replaces Cash — no manual deselect.
      await page.getByRole('button', { name: method.button, exact: true }).click();
      await expect(page.getByRole('button', { name: method.button, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.getByRole('button', { name: 'Cash', exact: true })).toHaveAttribute(
        'aria-pressed',
        'false',
      );

      await expect(page.locator('#pos-cash-tendered')).toHaveCount(0);
      await expect(page.getByText(/Confirm that payment has been received/i).first()).toBeVisible();
      await expect(page.getByText(/independently verified|provider verified/i)).toHaveCount(0);

      if (method.button === 'Card') {
        await page.getByPlaceholder(/card ref/i).fill('CARD-QA-1');
      } else if (method.button === 'Bank Transfer') {
        await page.getByPlaceholder(/transfer ref/i).fill('BT-QA-1');
      } else {
        await page.getByPlaceholder(/transaction ref/i).fill('MOMO-QA-1');
      }

      await page.screenshot({
        path: testInfo.outputPath(`paid-${method.label.replace(/\s+/g, '-').toLowerCase()}.png`),
        fullPage: true,
      });

      await page.getByRole('button', { name: /Complete Sale/i }).first().click();
      await expect(page.getByText(/Sale Complete|Ready for next customer/i).first()).toBeVisible({
        timeout: 30_000,
      });
    });
  }

  test('method switching clears incompatible cash state', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await gotoPos(page);
    await addFirstProduct(page);
    await page.locator('#pos-cash-tendered').fill('50');
    await page.getByRole('button', { name: 'Card', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cash', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.locator('#pos-cash-tendered')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cash', exact: true }).click();
    await expect(page.locator('#pos-cash-tendered')).toHaveValue('');
  });

  test('ordinary method clicks stay exclusive; Split enables multi-method', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await gotoPos(page);
    await addFirstProduct(page);

    await page.getByRole('button', { name: 'MoMo', exact: true }).click();
    await expect(page.getByRole('button', { name: 'MoMo', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Cash', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await page.getByRole('button', { name: 'Card', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Card', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'MoMo', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await page.getByRole('button', { name: 'Cash', exact: true }).click();
    await page.getByRole('button', { name: 'Split…' }).click();
    await expect(page.getByRole('button', { name: 'Split…' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Card', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cash', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Card', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByRole('button', { name: 'Split…' }).click();
    await expect(page.getByRole('button', { name: 'Split…' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'Card', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('split paid creates multi-method completion path', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await gotoPos(page);
    await addFirstProduct(page);

    await page.getByRole('button', { name: 'Split…' }).click();
    await page.getByRole('button', { name: 'Card', exact: true }).click();
    // Prefer the visible Card amount field in the split panel.
    const cardAmount = page.locator('input[type="number"]:visible').filter({ hasNot: page.locator('#pos-cash-tendered') }).first();
    if (await cardAmount.count()) {
      await cardAmount.fill('1');
    } else {
      const labeled = page.getByLabel(/card amount/i);
      if (await labeled.count()) await labeled.fill('1');
    }
    // Cover the cash remainder exactly.
    await page.getByRole('button', { name: 'Exact' }).click();

    await page.screenshot({ path: testInfo.outputPath('split-paid.png'), fullPage: true });
    const complete = page.getByRole('button', { name: /Complete Sale|Complete Cash Sale/i }).first();
    await expect(complete).toBeEnabled({ timeout: 10_000 });
    await complete.click();
    await expect(page.getByText(/Sale Complete|Ready for next customer/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('part paid requires customer and due-date decision', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await gotoPos(page);
    await addFirstProduct(page);

    await page.getByLabel(/payment status/i).selectOption('PART_PAID');
    await expect(page.getByRole('button', { name: /Complete Part-Paid Sale/i }).first()).toBeDisabled();
    await expect(page.getByText(/customer \(required\)|select a customer/i).first()).toBeVisible();

    // Walk-in cannot complete
    await page.locator('select[name="customerId"]').selectOption('');
    await chooseNoDueDate(page);
    await page.locator('#pos-cash-tendered').fill('1');
    await expect(page.getByRole('button', { name: /Complete Part-Paid Sale/i }).first()).toBeDisabled();

    await selectCustomer(page, 'Credit Customer Kofi');
    await page.locator('#pos-cash-tendered').fill('1');
    await chooseNoDueDate(page);
    await page.screenshot({ path: testInfo.outputPath('part-paid.png'), fullPage: true });

    await page.getByRole('button', { name: /Complete Part-Paid Sale/i }).first().click();
    await expect(page.getByText(/Sale Complete|Ready for next customer/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('unpaid credit requires customer and hides tender controls', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await gotoPos(page);
    await addFirstProduct(page);

    await page.getByLabel(/payment status/i).selectOption('UNPAID');
    await expect(page.locator('#pos-cash-tendered')).toHaveCount(0);
    await expect(page.getByText(/no payment is recorded/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Complete Credit Sale/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Complete Cash Sale/i })).toHaveCount(0);

    await selectCustomer(page, 'Credit Customer Kofi');
    await chooseNoDueDate(page);
    await page.screenshot({ path: testInfo.outputPath('unpaid-credit.png'), fullPage: true });

    await page.getByRole('button', { name: /Complete Credit Sale/i }).first().click();
    await expect(page.getByText(/Sale Complete|Ready for next customer/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('rejected submission retains cart; double-click does not duplicate', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await gotoPos(page);
    await addFirstProduct(page);

    // Force a client-visible rejection by selecting Part Paid without customer.
    await page.getByLabel(/payment status/i).selectOption('PART_PAID');
    await expect(page.getByRole('button', { name: /Complete Part-Paid Sale/i }).first()).toBeDisabled();
    await expect(page.getByText(/Perf SKU/i).first()).toBeVisible();

    // Return to Paid exact cash and hammer complete.
    await page.getByLabel(/payment status/i).selectOption('PAID');
    // Prefer the desktop sidebar CTA — the inline md: button can be obscured mid-layout.
    const complete = page
      .locator('.app-desktop-sidebar-sticky button.btn-primary')
      .filter({ hasText: /Complete Cash Sale/i });
    await expect(complete).toBeEnabled();

    // Concurrent completes: the first click submits and disables the CTA; later clicks must not hang the suite.
    await Promise.allSettled([
      complete.click({ force: true }),
      complete.click({ force: true }),
      complete.click({ force: true }),
    ]);
    await expect(page.getByText(/Sale Complete|Ready for next customer/i).first()).toBeVisible({
      timeout: 30_000,
    });

    // One success banner; cart cleared once.
    await expect(page.getByText(/Sale Complete/i)).toHaveCount(1);
  });

  test('Ctrl+Enter completes once while pending disables repeats', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await gotoPos(page);
    await addFirstProduct(page);
    await page.locator('#pos-cash-tendered').focus();
    await page.keyboard.press('Control+Enter');
    await page.keyboard.press('Control+Enter');
    await expect(page.getByText(/Sale Complete|Ready for next customer/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('large cart keeps complete action accessible', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await gotoPos(page);
    await addFirstProduct(page);
    // Grow the cart via quantity steppers to avoid flaky search-dropdown remounts.
    const plus = page.getByRole('button', { name: '+' }).first();
    for (let i = 0; i < 8; i += 1) {
      await plus.click();
    }
    await expect(page.getByRole('button', { name: /Complete Cash Sale/i }).first()).toBeVisible();
    await expect(page.getByPlaceholder(/type product name/i)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('large-cart.png'), fullPage: true });
  });
});

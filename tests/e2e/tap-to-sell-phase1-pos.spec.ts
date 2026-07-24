/**
 * Authenticated Home → POS progressive smoke (Phase 1).
 */
import { expect, test } from '@playwright/test';
import { loginAsRole, expectOwnerLanding } from './helpers/login';
import { hasRoleCredentials, missingRoleEnvMessage } from './helpers/env';

test.describe('Tap-to-Sell Phase 1 POS progressive @owner', () => {
  test.beforeEach(async ({ context }) => {
    test.skip(!hasRoleCredentials('owner'), missingRoleEnvMessage('owner'));
    await context.clearCookies();
  });

  test('Open POS reaches search before requiring deferred checkout extras', async ({ page }) => {
    await loginAsRole(page, 'owner');
    await expectOwnerLanding(page);

    const openPos = page.getByRole('link', { name: /Open POS/i }).first();
    await expect(openPos).toBeVisible({ timeout: 45_000 });

    const clickedAt = Date.now();
    await openPos.click();

    await page.waitForURL(/\/pos/, { timeout: 45_000 });
    const shellAt = Date.now();

    const search = page
      .locator('input[placeholder*="Search" i], input[placeholder*="scan" i], input[placeholder*="barcode" i], input[name="barcode"]')
      .first();

    await expect(search).toBeVisible({ timeout: 45_000 });
    const searchAt = Date.now();

    await expect(page.getByText(/Cart|Order|Total/i).first()).toBeVisible({ timeout: 30_000 });

    // Checkout may still be preparing — progressive contract allows that.
    const deferredHint = page.locator('[data-pos-deferred-loading="true"]');
    const checkoutPreparing = page.getByText(/Preparing checkout options/i);
    const deferredVisible =
      (await deferredHint.isVisible().catch(() => false)) ||
      (await checkoutPreparing.isVisible().catch(() => false));

    test.info().annotations.push({
      type: 'timing',
      description: JSON.stringify({
        openPosToShellMs: shellAt - clickedAt,
        openPosToSearchMs: searchAt - clickedAt,
        sawDeferredHint: deferredVisible,
      }),
    });
  });
});

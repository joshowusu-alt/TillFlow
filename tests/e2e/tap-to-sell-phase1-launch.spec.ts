/**
 * Browser smoke for Tap-to-Sell Phase 1 launch continuity (no commit).
 */
import { expect, test } from '@playwright/test';

test.describe('Tap-to-Sell Phase 1 launch continuity', () => {
  test('login clears cached business name before the next /launch', async ({ page }) => {
    await page.goto('/welcome');
    await page.evaluate(() => {
      window.localStorage.setItem('tillflow:lastBusinessName', 'SHOULD-NOT-APPEAR-AFTER-CLEAR');
      window.localStorage.setItem('tillflow:lastBusinessScope', 'stale');
    });

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Sign in to your account')).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => window.localStorage.getItem('tillflow:lastBusinessName')), {
        timeout: 5_000,
      })
      .toBeNull();

    await page.goto('/launch', { waitUntil: 'domcontentloaded' });
    const launchMessage = page.locator('#tillflow-launch-message');
    await expect(launchMessage).toHaveText('Opening your business...', {
      timeout: 5_000,
    });
    await expect(launchMessage).not.toContainText('SHOULD-NOT-APPEAR');
  });

  test('cached name personalises /launch with the shared contract', async ({ page }) => {
    await page.goto('/welcome');
    await page.evaluate(() => {
      window.localStorage.setItem('tillflow:lastBusinessName', 'EL-SHADDAI');
    });

    const launchPromise = page.goto('/launch', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#tillflow-launch-message')).toHaveText('Opening EL-SHADDAI...', {
      timeout: 5_000,
    });
    await expect(page.locator('body')).not.toContainText('workspace');
    await launchPromise;
  });
});

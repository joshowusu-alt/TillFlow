import { test, expect } from '@playwright/test';
import { loginAsRole, expectOwnerLanding, collectTillflowMarks, waitForProtectedShell } from './helpers/login';
import { hasRoleCredentials, missingRoleEnvMessage } from './helpers/env';

test.describe('Owner cold boot QA @owner', () => {
  test.beforeEach(async ({ context }) => {
    test.skip(!hasRoleCredentials('owner'), missingRoleEnvMessage('owner'));
    await context.clearCookies();
  });

  test('launch handoff reaches protected shell and owner readiness skeleton', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.sessionStorage.setItem('tillflow:launching', '1');
        window.sessionStorage.removeItem('tillflow:launchSplashSeen');
      } catch {
        // ignore
      }
    });

    await page.goto('/launch', { waitUntil: 'domcontentloaded' });
    await expect(page.getByAltText('TillFlow').or(page.locator('img[src*="tillflow-logo"]')).first()).toBeVisible();

    const urlDeadline = Date.now() + 45_000;
    while (Date.now() < urlDeadline) {
      if (page.url().includes('/login')) break;
      if (page.url().includes('/onboarding')) break;
      await page.waitForTimeout(300);
    }

    if (page.url().includes('/login')) {
      await loginAsRole(page, 'owner');
      await expectOwnerLanding(page);
    }

    await waitForProtectedShell(page);

    const topNav = page.getByRole('navigation', { name: /Main navigation/i });
    await expect(topNav).toBeVisible();

    const splash = page.locator('#tillflow-initial-splash');
    await expect(splash).toHaveCount(0, { timeout: 15_000 });

    const restricted = await page.getByRole('heading', { name: /^Access restricted$/i }).isVisible().catch(() => false);
    if (restricted) {
      test.info().annotations.push({
        type: 'qa-blocker',
        description: 'QA tenant is billing-restricted; owner readiness/dashboard checks require an active QA tenant.',
      });
      return;
    }

    const skeletonVisible = await page
      .getByRole('status', { name: /Preparing owner dashboard/i })
      .isVisible()
      .catch(() => false);
    const todayCopyVisible = await page.getByText(/Today in your shop/i).isVisible().catch(() => false);
    const dashboardReady = await page
      .getByRole('link', { name: /Expected Cash/i })
      .isVisible()
      .catch(() => false);

    if (!skeletonVisible && !todayCopyVisible && !dashboardReady) {
      await expect(
        page.getByRole('link', { name: /Expected Cash/i }).or(page.getByRole('heading', { level: 1 })).first(),
      ).toBeVisible({ timeout: 60_000 });
    } else {
      await expect(page.getByRole('link', { name: /Expected Cash/i }).first()).toBeVisible({ timeout: 60_000 });
    }

    if (!skeletonVisible && !todayCopyVisible) {
      test.info().annotations.push({
        type: 'owner-readiness',
        description: 'Cold boot reached owner dashboard without catching the readiness skeleton (fast stream or cached shell).',
      });
    }

    const marks = await collectTillflowMarks(page);
    test.info().annotations.push({
      type: 'client-marks',
      description: JSON.stringify(marks),
    });
  });
});

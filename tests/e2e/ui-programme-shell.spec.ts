import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  expectShellContract,
  expectSignOutReachable,
  readShellGeometry,
} from './helpers/shell-geometry';
import { isProductionPlaywrightTarget } from './helpers/env';

const VIEWPORTS = [
  { name: 'phone-portrait-320', width: 320, height: 568 },
  { name: 'phone-portrait-390', width: 390, height: 844 },
  { name: 'phone-landscape-844', width: 844, height: 390 },
  { name: 'phone-landscape-568', width: 568, height: 320 },
  { name: 'phone-keyboard-390', width: 390, height: 400 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'desktop-short', width: 1280, height: 480 },
  { name: 'desktop-1280', width: 1280, height: 720 },
] as const;

const ROUTES = [
  { path: '/onboarding', pos: false, heading: /home|setup|today|sell/i },
  { path: '/pos', pos: true, heading: /./ },
  { path: '/products', pos: false, heading: /product/i },
  { path: '/purchases', pos: false, heading: /purchase/i },
  { path: '/shifts', pos: false, heading: /shift/i },
  { path: '/settings', pos: false, heading: /setting/i },
  { path: '/reports', pos: false, heading: /report/i },
] as const;

const SHOT_DIR = path.join('playwright', 'test-results', 'ui-programme-shots');

async function attachShot(
  page: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo,
  name: string,
) {
  mkdirSync(SHOT_DIR, { recursive: true });
  const file = path.join(SHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

test.describe('UI programme shell geometry (read-only)', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(isProductionPlaywrightTarget(), 'Blocked against Production');
    testInfo.annotations.push({ type: 'writes', description: 'none' });
  });

  test('seed owner can open Home and POS without a sale', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await page.locator('#main-content').waitFor({ state: 'visible' });
    await expectNoHorizontalOverflow(page);
    await expectShellContract(page, false);
    const save = page.getByRole('button', { name: /^Save$/ });
    if ((await save.count()) > 0) {
      await save.scrollIntoViewIfNeeded();
      const saveBox = await save.boundingBox();
      const navBox = await page.locator('.mobile-bottom-tab-bar').boundingBox();
      if (saveBox && navBox) {
        expect(saveBox.y + saveBox.height, 'Save stays above bottom nav after scroll').toBeLessThanOrEqual(
          navBox.y + 8,
        );
      }
    }

    await page.goto('/pos', { waitUntil: 'domcontentloaded' });
    await page.locator('#main-content').waitFor({ state: 'visible' });
    await expect(page.getByLabel(/search products/i).or(page.locator('input[type="search"]')).first()).toBeVisible({
      timeout: 20_000,
    });
    await expectNoHorizontalOverflow(page);
    await expectShellContract(page, true);
  });

  for (const viewport of VIEWPORTS) {
    test(`Home+POS geometry at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
      await page.locator('#main-content').waitFor({ state: 'visible' });
      await expectNoHorizontalOverflow(page);
      await expectSignOutReachable(page, false);

      await page.goto('/pos', { waitUntil: 'domcontentloaded' });
      await page.locator('#main-content').waitFor({ state: 'visible' });
      await expectNoHorizontalOverflow(page);
      await expectSignOutReachable(page, true);
    });
  }

  test('Home rotation does not keep an invalid scroll offset', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await page.locator('#main-content').waitFor({ state: 'visible' });
    await attachShot(page, testInfo, 'home-portrait-before-rotation');
    await page.evaluate(() => window.scrollTo(0, 400));
    await attachShot(page, testInfo, 'home-portrait-scrolled-before-rotation');
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await page.waitForTimeout(200);
    const afterLandscape = await readShellGeometry(page);
    expect(afterLandscape.scrollY).toBeLessThanOrEqual(24);
    await expectNoHorizontalOverflow(page);
    await expectShellContract(page, false);
    await attachShot(page, testInfo, 'home-landscape-after-portrait-rotation');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await page.waitForTimeout(200);
    await expectNoHorizontalOverflow(page);
    await expectShellContract(page, false);
    await attachShot(page, testInfo, 'home-portrait-after-landscape-rotation');
  });

  test('POS rotation does not complete a sale', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/pos', { waitUntil: 'domcontentloaded' });
    await page.locator('#main-content').waitFor({ state: 'visible' });
    await expect(page.getByLabel(/search products/i).first()).toBeVisible({ timeout: 20_000 });
    await attachShot(page, testInfo, 'pos-portrait');
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await page.waitForTimeout(200);
    await expect(page.getByLabel(/search products/i).first()).toBeVisible();
    await expect(page).not.toHaveURL(/\/receipts\//);
    await expectNoHorizontalOverflow(page);
    await expectShellContract(page, true);
    await attachShot(page, testInfo, 'pos-landscape-after-rotation');
  });

  test('Home More drawer exposes Sign out without a second hamburger', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await page.locator('#main-content').waitFor({ state: 'visible' });
    await expect(page.locator('[data-shell-menu-button="true"]')).toBeHidden();
    await page.locator('[data-shell-more="true"]').click();
    await expect(page.locator('[data-shell-signout="drawer"]').first()).toBeVisible();
    await attachShot(page, testInfo, 'home-more-drawer');
    await page.keyboard.press('Escape');
  });

  test('operational list routes keep shell clearance', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ROUTES.filter((item) => !item.pos)) {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      await page.locator('#main-content').waitFor({ state: 'visible' });
      await expectNoHorizontalOverflow(page);
      await expectShellContract(page, false);
      await attachShot(page, testInfo, `route-${route.path.replace(/\//g, '-') || 'home'}`);
    }
  });

  test('error, empty and loading evidence stay inside the shell', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/products/ui-programme-missing-product', { waitUntil: 'domcontentloaded' });
    await page.locator('#main-content').waitFor({ state: 'visible' });
    await expectNoHorizontalOverflow(page);
    await attachShot(page, testInfo, 'error-missing-product');

    await page.goto('/customers', { waitUntil: 'domcontentloaded' });
    await page.locator('#main-content').waitFor({ state: 'visible' });
    await expectNoHorizontalOverflow(page);
    await attachShot(page, testInfo, 'customers-populated-or-empty');

    const skeleton = page.locator('[data-route-skeleton]').first();
    await page.goto('/products', { waitUntil: 'commit' });
    if (await skeleton.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await attachShot(page, testInfo, 'products-loading-skeleton');
    }
    await page.locator('#main-content').waitFor({ state: 'visible' });
    await attachShot(page, testInfo, 'products-final');
  });

  test('authenticated landmarks, skip link and 200% zoom remain usable', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await page.locator('#main-content').waitFor({ state: 'visible' });
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('navigation', { name: /primary mobile navigation/i })).toBeVisible();
    const skip = page.getByRole('link', { name: /skip to content/i });
    await skip.focus();
    await expect(skip).toBeFocused();
    await skip.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await page.waitForTimeout(100);
    await expectNoHorizontalOverflow(page, 8);
    await attachShot(page, testInfo, 'home-200pct-zoom');

    await page.evaluate(() => {
      document.documentElement.style.zoom = '1';
    });
    await page.goto('/products', { waitUntil: 'domcontentloaded' });
    await page.locator('#main-content').waitFor({ state: 'visible' });
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await page.locator('#main-content').waitFor({ state: 'visible' });
    await page.goBack();
    await expect(page).toHaveURL(/\/products/);
    await page.goForward();
    await expect(page).toHaveURL(/\/onboarding/);
  });
});

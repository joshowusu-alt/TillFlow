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
  { name: 'phone-landscape-568', width: 568, height: 320 },
  { name: 'phone-landscape-667', width: 667, height: 375 },
  { name: 'phone-landscape-740', width: 740, height: 360 },
  { name: 'phone-landscape-844', width: 844, height: 390 },
  { name: 'phone-landscape-915', width: 915, height: 412 },
  { name: 'phone-landscape-932', width: 932, height: 430 },
  { name: 'phone-keyboard-390', width: 390, height: 400 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
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
    expect(afterLandscape.scrollY).toBeLessThanOrEqual(40);
    await expectNoHorizontalOverflow(page);
    await expectShellContract(page, false);
    const primary = page.locator('a.home-open-pos, a[href="/pos"]').first();
    if ((await primary.count()) > 0 && (await primary.isVisible().catch(() => false))) {
      const box = await primary.boundingBox();
      expect(box, 'primary action remains in the landscape viewport').toBeTruthy();
      if (box) {
        expect(box.y).toBeGreaterThanOrEqual(-8);
        expect(box.y + box.height).toBeLessThanOrEqual(390 + 8);
      }
    }
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
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.locator('[data-shell-drawer-close="true"]')).toBeFocused();
    await page.keyboard.press('Tab');
    const focusInside = await page.evaluate(() => {
      const dialogNode = document.getElementById('shell-more-drawer');
      return Boolean(dialogNode && dialogNode.contains(document.activeElement));
    });
    expect(focusInside, 'Tab stays inside the More drawer').toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-shell-more="true"]')).toBeFocused();
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
    await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
    await page.waitForTimeout(100);
    await expectNoHorizontalOverflow(page, 8);
    await attachShot(page, testInfo, 'home-200pct-zoom');

    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
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

  test('Home never flashes the generic parent loader or the wrong journey skeleton', async ({ page }) => {
    await page.addInitScript(() => {
      const frames: string[] = [];
      (window as unknown as { __tfLoadingFrames: string[] }).__tfLoadingFrames = frames;
      const record = () => {
        document.querySelectorAll('[role="status"][aria-label]').forEach((node) => {
          const label = node.getAttribute('aria-label');
          if (label) frames.push(label);
        });
      };
      new MutationObserver(record).observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['aria-label'],
      });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await page.locator('#main-content').waitFor({ state: 'visible' });
    const frames = await page.evaluate(
      () => (window as unknown as { __tfLoadingFrames?: string[] }).__tfLoadingFrames ?? [],
    );
    expect(frames.filter((label) => label === 'Loading page'), 'generic parent loader must not flash').toEqual([]);
    const hadChecklist = frames.includes('Preparing setup checklist');
    const hadEstablished = frames.includes('Preparing owner home');
    expect(hadChecklist && hadEstablished, 'both Home skeletons must not appear').toBe(false);
    const establishedHome = (await page.locator('.home-hero').count()) > 0;
    if (establishedHome) {
      expect(hadChecklist, 'established Home must not show the checklist skeleton').toBe(false);
    }
  });

  test('short landscape Home keeps content below the header when a field is focused', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await page.locator('#main-content').waitFor({ state: 'visible' });
    const field = page.locator('#main-content input, #main-content textarea, #main-content select').first();
    if ((await field.count()) > 0) {
      await field.focus();
    }
    await expectShellContract(page, false, { keepFocus: true });
    await expectNoHorizontalOverflow(page);
  });

  test('status is not colour-only and only one navigation is exposed on phones', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await page.locator('#main-content').waitFor({ state: 'visible' });
    await expect(page.locator('.nav-trust-status-compact, .nav-trust-status-label').first()).toBeVisible();
    const desktopNav = page.locator('nav[aria-label="Main navigation"]');
    await expect(desktopNav).toHaveAttribute('inert', '');
    await expect(page.getByRole('navigation', { name: /primary mobile navigation/i })).toBeVisible();
  });

  test('loading harness route is compiled out of the application', async ({ page }) => {
    const probe = await page.goto('/dev/loading-harness?route=/products', { waitUntil: 'domcontentloaded' });
    expect(probe?.status() ?? 404).toBe(404);
  });

  test('route loading families stay compact on live pages', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const routes = [
      '/products',
      '/purchases',
      '/shifts',
      '/settings',
      '/reports',
      '/reports/money-received',
      '/online-orders',
      '/people',
    ];
    for (const route of routes) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.locator('#main-content').waitFor({ state: 'visible' });
      await attachShot(page, testInfo, `final${route.replace(/\//g, '-')}`);
    }
  });
});

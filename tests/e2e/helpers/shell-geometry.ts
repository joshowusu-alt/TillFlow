import { expect, type Page } from '@playwright/test';
import {
  SHELL_LG_PX,
  SHELL_MIN_TOUCH_TARGET_PX,
  classifyShellLayout,
  shellShowsHeaderHamburger,
  shellShowsHeaderSignOut,
  shellUsesBottomTabs,
} from '../../../lib/navigation/shell-layout';

export async function expectNoHorizontalOverflow(page: Page, tolerance = 2) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  // 320 CSS px on Linux Chromium can report 2–4px of non-pannable body delta.
  const allowed = metrics.innerWidth <= 360 ? Math.max(tolerance, 4) : tolerance;
  expect(metrics.scrollWidth, 'document scrollWidth overflow').toBeLessThanOrEqual(
    metrics.innerWidth + allowed,
  );
  expect(metrics.bodyScrollWidth, 'body scrollWidth overflow').toBeLessThanOrEqual(
    metrics.innerWidth + allowed,
  );
}

export async function readShellGeometry(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector('.app-shell-header') as HTMLElement | null;
    const main = document.querySelector('#main-content') as HTMLElement | null;
    const bottom = document.querySelector('.mobile-bottom-tab-bar') as HTMLElement | null;
    const headerBox = header?.getBoundingClientRect();
    const mainBox = main?.getBoundingClientRect();
    const headerBottom = header
      ? header.getBoundingClientRect().top + header.offsetHeight
      : 0;
    const bottomBox = bottom && getComputedStyle(bottom).display !== 'none'
      ? bottom.getBoundingClientRect()
      : null;
    const headerSignOut = document.querySelector('[data-shell-signout="header"]') as HTMLElement | null;
    const drawerSignOut = document.querySelector('[data-shell-signout="drawer"]') as HTMLElement | null;
    const more = document.querySelector('[data-shell-more="true"]') as HTMLElement | null;
    const hamburger = document.querySelector('[data-shell-menu-button="true"]') as HTMLElement | null;
    const trustName = document.querySelector('[data-nav-trust-name="true"]') as HTMLElement | null;
    const logo = document.querySelector('.app-shell-header a[aria-label*="TillFlow"]') as HTMLElement | null;
    const trustTrees = document.querySelectorAll('[data-nav-trust="true"]').length;
    const mainNav = document.querySelector('nav[aria-label="Main navigation"]') as HTMLElement | null;
    const mainNavInert = Boolean(mainNav?.hasAttribute('inert'));

    const visible = (el: HTMLElement | null) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        return false;
      }
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };

    return {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollY: window.scrollY,
      headerHeight: header?.offsetHeight ?? headerBox?.height ?? 0,
      headerBottom,
      mainTop: mainBox?.top ?? 0,
      mainBottom: mainBox?.bottom ?? 0,
      bottomTop: bottomBox?.top ?? null,
      bottomVisible: Boolean(bottomBox && bottomBox.height > 0),
      headerSignOutVisible: visible(headerSignOut),
      drawerOpen: Boolean(drawerSignOut && visible(drawerSignOut)),
      moreVisible: visible(more),
      hamburgerVisible: visible(hamburger),
      trustNameVisible: visible(trustName),
      logoVisible: visible(logo),
      logoHeight: logo?.getBoundingClientRect().height ?? 0,
      trustTrees,
      mainNavInert,
    };
  });
}

export async function expectShellContract(page: Page, isPosRoute: boolean) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction((lg) => {
    const nav = document.querySelector('nav[aria-label="Main navigation"]');
    if (!nav) return false;
    const desktop = window.innerWidth >= lg;
    const inert = nav.hasAttribute('inert');
    return desktop ? !inert : inert;
  }, SHELL_LG_PX);

  const geo = await readShellGeometry(page);
  const mode = classifyShellLayout({ width: geo.width, height: geo.height });

  expect(geo.headerHeight, 'header occupies space').toBeGreaterThan(32);
  expect(geo.mainTop + 1, 'main starts below sticky header').toBeGreaterThanOrEqual(geo.headerBottom - 8);
  expect(geo.trustNameVisible, 'owner identity visible').toBe(true);
  expect(geo.logoVisible, 'logo visible').toBe(true);
  expect(geo.logoHeight, 'logo readable').toBeGreaterThanOrEqual(16);
  expect(geo.trustTrees, 'one identity tree').toBe(1);
  if (mode === 'desktop' || mode === 'desktop-short') {
    expect(geo.mainNavInert, 'desktop main nav remains accessible').toBe(false);
  } else {
    expect(geo.mainNavInert, 'phone/tablet main nav is inert').toBe(true);
  }

  expect(geo.headerSignOutVisible).toBe(shellShowsHeaderSignOut(mode));
  expect(geo.hamburgerVisible).toBe(shellShowsHeaderHamburger(mode, isPosRoute));
  expect(geo.moreVisible).toBe(shellUsesBottomTabs(mode, isPosRoute));

  if (geo.bottomVisible && geo.bottomTop !== null) {
    const navHeight = geo.height - geo.bottomTop;
    const pad = await page.evaluate(() => {
      const main = document.querySelector('#main-content');
      return main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
    });
    expect(pad, 'main reserves bottom-nav clearance').toBeGreaterThanOrEqual(navHeight - 4);
  }

  const undersized = await page.evaluate((min) => {
    const selectors = [
      '.mobile-bottom-tab-item',
      '[data-shell-menu-button="true"]',
      '[data-shell-signout="header"]',
      '[data-shell-more="true"]',
      'a.home-open-pos',
      '.app-shell-header a[aria-label*="TillFlow"]',
    ];
    const tooSmall: string[] = [];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        const el = node as HTMLElement;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const box = el.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) continue;
        if (box.height + 0.5 < min || box.width + 0.5 < min) {
          tooSmall.push(`${selector}:${Math.round(box.width)}x${Math.round(box.height)}`);
        }
      }
    }
    return tooSmall;
  }, SHELL_MIN_TOUCH_TARGET_PX);
  expect(undersized, `touch targets below ${SHELL_MIN_TOUCH_TARGET_PX}px`).toEqual([]);

  return { geo, mode };
}

export async function expectSignOutReachable(page: Page, isPosRoute: boolean) {
  const { geo, mode } = await expectShellContract(page, isPosRoute);
  if (geo.headerSignOutVisible) return { geo, mode };
  if (isPosRoute) {
    const hamburger = page.locator('[data-shell-menu-button="true"]');
    await expect(hamburger).toBeVisible();
    await hamburger.click();
    await expect(page.locator('[data-shell-signout="drawer"]').first()).toBeVisible();
    await page.keyboard.press('Escape');
    const overlay = page.locator('[data-shell-drawer-overlay="true"]');
    if (await overlay.isVisible().catch(() => false)) {
      await overlay.click({ force: true });
    }
    return { geo, mode };
  }
  const more = page.locator('[data-shell-more="true"]');
  await expect(more).toBeVisible();
    await more.click();
    await expect(page.locator('[data-shell-signout="drawer"]').first()).toBeVisible();
    await page.keyboard.press('Escape');
    const overlay = page.locator('[data-shell-drawer-overlay="true"]');
    if (await overlay.isVisible().catch(() => false)) {
      await overlay.click({ force: true });
    }
    return { geo, mode };
}

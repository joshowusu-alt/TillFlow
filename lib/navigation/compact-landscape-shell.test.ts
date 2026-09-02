import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHELL_COMPACT_LANDSCAPE_MQ, SHELL_DESKTOP_SHORT_MQ, SHELL_PHONE_KEYBOARD_MQ } from './shell-layout';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Compact phone-landscape shell', () => {
  it('defines an orientation + short-height compact shell, not width-only sm/md tablet chrome', () => {
    const css = read('app/globals.css');
    expect(css).toContain(`@media ${SHELL_COMPACT_LANDSCAPE_MQ}`);
    expect(css).toContain(SHELL_PHONE_KEYBOARD_MQ);
    expect(css).toContain('.app-shell-status-strip');
    expect(css).toContain('.nav-trust');
    expect(css).toContain('.nav-trust-signout');
    expect(css).toContain('.home-open-pos');
    expect(css).toContain('bottom: calc(var(--mobile-bottom-nav-height) + 0.5rem)');
  });

  it('keeps an opaque header so the blue Home hero cannot bleed through the lockup', () => {
    const topNav = read('components/TopNav.tsx');
    expect(topNav).toContain('bg-white shadow-nav');
    expect(topNav).not.toContain('bg-white/96');
    expect(topNav).toContain('app-shell-status-strip');
    expect(topNav).toContain('app-shell-menu-button');
    expect(topNav).toContain('orientationchange');
    expect(topNav).toContain('SHELL_COMPACT_LANDSCAPE_MQ');
  });

  it('uses one identity tree and keeps Sign out in More for compact landscape', () => {
    const trust = read('components/NavTrustPanel.tsx');
    const menu = read('components/NavMobileMenu.tsx');
    expect(trust).toContain('data-nav-trust="true"');
    expect(trust).not.toContain('nav-trust-compact');
    expect(trust).not.toContain('nav-trust-tablet');
    expect(trust).not.toContain('nav-trust-desktop');
    expect(trust).toContain('hidden md:block');
    expect((trust.match(/<LogoutForm/g) ?? []).length).toBe(1);
    expect(menu).toContain('Sign out');
    expect(menu).toContain('data-shell-signout="drawer"');
  });

  it('does not apply compact landscape rules at desktop width where Sign out lives in the header', () => {
    const css = read('app/globals.css');
    expect(css).toContain(`@media ${SHELL_DESKTOP_SHORT_MQ}`);
    expect(css.indexOf('@media (orientation: landscape) and (max-height: 500px) {')).toBe(-1);
    const compactBlock = css.slice(
      css.indexOf(`@media ${SHELL_COMPACT_LANDSCAPE_MQ}`),
      css.indexOf(`@media ${SHELL_DESKTOP_SHORT_MQ}`),
    );
    expect(compactBlock).toContain('.nav-trust-signout');
    expect(compactBlock).toContain('display: none');
  });

  it('lets app-main-shell own padding-bottom so Tailwind py-* cannot collapse bottom-nav clearance', () => {
    const layout = read('app/(protected)/layout.tsx');
    expect(layout).toContain('app-main-shell');
    expect(layout).toContain('pt-3');
    expect(layout).not.toContain('py-3 sm:px-5 sm:py-4 lg:px-6 lg:py-5');
  });

  it('hides the non-POS hamburger so More is the only menu below lg', () => {
    const topNav = read('components/TopNav.tsx');
    expect(topNav).toContain("isPosRoute ? 'flex lg:hidden' : 'hidden'");
  });

  it('reserves bottom-nav space including safe-area and prefetches POS from the tab bar', () => {
    const css = read('app/globals.css');
    const bar = read('components/BottomTabBar.tsx');
    expect(css).toContain('--mobile-bottom-nav-height');
    expect(css).toContain('env(safe-area-inset-bottom');
    expect(bar).toContain('mobile-bottom-tab-bar');
    expect(bar).toContain("prefetch={tab.href === '/pos' ? true : undefined}");
    expect(bar).toContain('data-shell-more="true"');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Compact phone-landscape shell', () => {
  it('defines an orientation + short-height compact shell, not width-only sm/md tablet chrome', () => {
    const css = read('app/globals.css');
    expect(css).toContain('@media (orientation: landscape) and (max-height: 500px)');
    expect(css).toContain('.app-shell-status-strip');
    expect(css).toContain('.nav-trust-compact');
    expect(css).toContain('.nav-trust-tablet');
    expect(css).toContain('.home-open-pos');
    expect(css).toContain('bottom: calc(var(--mobile-bottom-nav-height) + 0.5rem)');
    expect(css).toContain('.app-shell-header:not(.app-shell-header-pos) .app-shell-menu-button');
  });

  it('keeps an opaque header so the blue Home hero cannot bleed through the lockup', () => {
    const topNav = read('components/TopNav.tsx');
    expect(topNav).toContain('bg-white shadow-nav');
    expect(topNav).not.toContain('bg-white/96');
    expect(topNav).toContain('app-shell-status-strip');
    expect(topNav).toContain('app-shell-menu-button');
    expect(topNav).toContain('orientationchange');
    expect(topNav).toContain("max-height: 500px");
  });

  it('shows compact identity in landscape and keeps Sign out inside the More drawer', () => {
    const trust = read('components/NavTrustPanel.tsx');
    const menu = read('components/NavMobileMenu.tsx');
    expect(trust).toContain('nav-trust-compact');
    expect(trust).toContain('nav-trust-tablet');
    expect(trust).toContain('nav-trust-signout-tablet');
    expect(menu).toContain('Sign out');
  });

  it('reserves bottom-nav space including safe-area and prefetches POS from the tab bar', () => {
    const css = read('app/globals.css');
    const bar = read('components/BottomTabBar.tsx');
    expect(css).toContain('--mobile-bottom-nav-height');
    expect(css).toContain('env(safe-area-inset-bottom');
    expect(bar).toContain('mobile-bottom-tab-bar');
    expect(bar).toContain("prefetch={tab.href === '/pos' ? true : undefined}");
  });
});

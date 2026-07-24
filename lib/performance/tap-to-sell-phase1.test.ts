import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Tap-to-Sell Phase 1 contracts', () => {
  it('shares one launch-copy contract and clears identity on auth entry/logout', () => {
    const identity = read('lib/launch/business-identity.ts');
    const redirector = read('components/LaunchRedirector.tsx');
    const rootLaunch = read('components/RootLaunchLoading.tsx');
    const appLaunch = read('components/AppLaunchLoading.tsx');
    const login = read('app/(auth)/login/page.tsx');
    const logoutForm = read('components/LogoutForm.tsx');
    const saver = read('components/BusinessNameSaver.tsx');

    expect(identity).toContain('LAUNCH_GENERIC_MESSAGE');
    expect(identity).toContain('clearLaunchBusinessIdentity');
    expect(identity).toContain('syncLaunchBusinessIdentity');
    expect(identity).toContain("Opening ${clean}...");
    expect(identity).not.toContain('workspace');

    expect(redirector).toContain('getLaunchCopy');
    expect(redirector).toContain("router.replace('/onboarding')");
    expect(redirector).not.toContain('Opening your business workspace');

    expect(rootLaunch).toContain('mode="launch"');
    expect(rootLaunch).toContain('shell="fullscreen"');
    expect(rootLaunch).not.toContain('message={');
    expect(rootLaunch).not.toContain('ROOT_COLD_START_MESSAGE}');

    expect(appLaunch).toContain('getLaunchCopy');
    expect(login).toContain('ClearLaunchIdentityOnAuthEntry');
    expect(logoutForm).toContain('clearLaunchBusinessIdentity');
    expect(saver).toContain('syncLaunchBusinessIdentity');
    expect(saver).toContain('businessId');
  });

  it('loads POS products/inventory before deferred checkout extras', () => {
    const posBoard = read('app/(protected)/pos/PosBoard.tsx');
    const deferred = read('app/(protected)/pos/PosDeferredSection.tsx');
    const shell = read('components/pos/PosProgressiveShell.tsx');
    const client = read('app/(protected)/pos/PosClient.tsx');

    expect(posBoard).toContain('page.pos.initial-data-load');
    expect(posBoard).toContain('page.pos.products-load');
    expect(posBoard).toContain('page.pos.inventory-load');
    expect(posBoard).toContain('PosProgressiveShell');
    expect(posBoard).toContain('PosDeferredSection');
    expect(posBoard).not.toContain('getCachedCustomers');
    expect(posBoard).not.toContain('getCachedTills');

    expect(deferred).toContain('page.pos.deferred-data-load');
    expect(deferred).toContain('page.pos.customers-load');
    expect(deferred).toContain('page.pos.tills-load');
    expect(deferred).toContain('customersUnavailable');
    expect(deferred).toContain('checkoutUnavailable');

    expect(shell).toContain('checkoutExtrasReady');
    expect(client).toContain('checkoutExtrasReady');
    expect(client).toContain('customersUnavailable');
    expect(client).toContain('Preparing checkout');
    expect(client).toContain('data-checkout-till-state');
    expect(client).toContain('No tills are configured');
    expect(client).toContain('Checkout information could not be loaded');
  });

  it('removes the More drawer full-screen blank overlay', () => {
    const topNav = read('components/TopNav.tsx');
    expect(topNav).toContain('data-mobile-route-progress="true"');
    expect(topNav).not.toContain('data-route-transition="true"');
    expect(topNav).not.toContain('fixed inset-0 z-[25] bg-paper');
  });

  it('gives Open POS immediate pending feedback without a blank overlay', () => {
    const chrome = read('components/owner-home/home-chrome.tsx');
    expect(chrome).toContain("'use client'");
    expect(chrome).toContain('Opening POS');
    expect(chrome).toContain('data-nav-pending');
    expect(chrome).toContain("prefetch={isPos ? true : undefined}");
  });

  it('covers modern Dynamic Island startup images', () => {
    const layout = read('app/layout.tsx');
    expect(existsSync(join(root, 'public/splash/apple-splash-1206x2622.png'))).toBe(true);
    expect(existsSync(join(root, 'public/splash/apple-splash-1320x2868.png'))).toBe(true);
    expect(layout).toContain('apple-splash-1206x2622.png');
    expect(layout).toContain('apple-splash-1320x2868.png');
    expect(layout).toContain('device-width: 402px');
    expect(layout).toContain('device-width: 440px');
    expect(layout).toContain("backgroundColor: '#F8FBFF'");
  });

  it('does not change owner start destination or Home financial loaders', () => {
    const redirector = read('components/LaunchRedirector.tsx');
    const critical = read('lib/owner-home/critical-shell.ts');
    expect(redirector).toContain("router.replace('/onboarding')");
    expect(critical).toContain('getOwnerHomeCriticalShell');
  });
});

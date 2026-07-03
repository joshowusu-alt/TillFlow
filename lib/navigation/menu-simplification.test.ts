import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CASHIER_HAS_MY_ACCOUNT_ROUTE,
  CASHIER_MENU_ITEMS,
  CASHIER_MY_ACCOUNT_HREF,
  getBottomTabsForRole,
  getCashierMenu,
  getManagerMenu,
  getOwnerLauncherMenu,
  MANAGER_MENU_SECTIONS,
  MOBILE_TAB_NAV_HREFS_BY_ROLE,
  OWNER_BROWSE_AREAS,
  OWNER_QUICK_ACTIONS,
} from '@/lib/navigation/mobile-menu-config';
import { CASHIER_MY_SALES_ROUTE } from '@/lib/services/cashier-my-sales';
import { NAV_GROUPS } from '@/lib/navigation-config';
import { getFeatures } from '@/lib/features';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const ownerContext = {
  role: 'OWNER' as const,
  features: getFeatures('PRO', 'SINGLE_STORE', { onlineStorefront: true }),
  momoEnabled: true,
};

const managerContext = {
  role: 'MANAGER' as const,
  features: getFeatures('GROWTH', 'SINGLE_STORE'),
  momoEnabled: true,
};

const cashierContext = {
  role: 'CASHIER' as const,
  features: getFeatures('STARTER', 'SINGLE_STORE'),
  momoEnabled: true,
};

describe('T4 role-based business launcher menu', () => {
  const topNav = read('components/TopNav.tsx');
  const mobileMenu = read('components/NavMobileMenu.tsx');
  const bottomTabBar = read('components/BottomTabBar.tsx');

  it('uses a dedicated mobile launcher config instead of regrouping the desktop list', () => {
    expect(read('lib/navigation/mobile-menu-config.ts')).toContain('OWNER_QUICK_ACTIONS');
    expect(read('lib/navigation/mobile-menu-config.ts')).toContain('OWNER_BROWSE_AREAS');
    expect(mobileMenu).toContain('Quick actions');
    expect(mobileMenu).toContain('Browse by area');
    expect(mobileMenu).not.toContain('visibleGroups');
  });

  it('keeps owner quick actions aligned to the approved launcher set', () => {
    expect(OWNER_QUICK_ACTIONS.map((item) => item.label)).toEqual([
      'Open POS',
      'Sales',
      'Inventory',
      'Purchases',
      'Reports',
      'Business settings',
    ]);
    expect(OWNER_QUICK_ACTIONS.map((item) => item.href)).toEqual([
      '/pos',
      '/sales',
      '/inventory',
      '/purchases',
      '/reports',
      '/settings',
    ]);
  });

  it('keeps owner browse areas collapsed by default and short', () => {
    expect(OWNER_BROWSE_AREAS.map((area) => area.label)).toEqual([
      'Daily work',
      'Stock & suppliers',
      'Money',
      'Reports',
      'Online & customers',
      'Admin',
    ]);
    expect(mobileMenu).toContain('expandedAreas[area.id] ?? false');
    expect(mobileMenu).not.toContain('REPORT_NAV_SECTIONS');
  });

  it('does not render dashboard KPI cards or a report mega-menu in the mobile drawer', () => {
    expect(mobileMenu).not.toContain('Today sales · all branches');
    expect(mobileMenu).not.toContain('Transactions · all branches');
    expect(mobileMenu).not.toContain('metric-chip');
    expect(mobileMenu).not.toContain('visibleGroups.map');
    expect(topNav).toContain('NavTrustPanel');
    expect(topNav).toContain('getNavTodaySales');
  });

  it('keeps owner operational and admin routes reachable through the launcher', () => {
    const ownerMenu = getOwnerLauncherMenu(ownerContext);
    const browseHrefs = ownerMenu.browseAreas.flatMap((area) => area.items.map((item) => item.href));

    expect(ownerMenu.quickActions.map((item) => item.href)).toEqual(
      expect.arrayContaining(['/pos', '/sales', '/inventory', '/purchases', '/reports', '/settings']),
    );
    expect(browseHrefs).toEqual(
      expect.arrayContaining([
        '/pos',
        '/sales',
        '/products',
        '/inventory',
        '/purchases',
        '/reports',
        '/settings',
        '/users',
        '/customers',
        '/suppliers',
      ]),
    );
  });

  it('uses owner bottom nav without POS', () => {
    const tabs = getBottomTabsForRole('OWNER');
    expect(tabs.map((tab) => tab.label)).toEqual(['Home', 'Sales', 'Inventory', 'Reports', 'More']);
    expect(tabs.some((tab) => tab.href === '/pos')).toBe(false);
    expect(tabs.some((tab) => tab.label === 'Open POS')).toBe(false);
  });

  it('uses manager bottom nav for operational oversight', () => {
    const tabs = getBottomTabsForRole('MANAGER');
    expect(tabs.map((tab) => tab.label)).toEqual(['POS', 'Sales', 'Inventory', 'Purchases', 'More']);
  });

  it('uses cashier bottom nav with My Sales and no duplicate routes', () => {
    const tabs = getBottomTabsForRole('CASHIER');
    const hrefs = tabs.filter((tab) => tab.href).map((tab) => tab.href!);

    expect(tabs.map((tab) => tab.label)).toEqual(['POS', 'My Sales', 'My Shift', 'Account', 'More']);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(tabs.some((tab) => tab.label === 'POS' && tab.href === '/pos')).toBe(true);
    expect(tabs.some((tab) => tab.label === 'My Sales' && tab.href === CASHIER_MY_SALES_ROUTE)).toBe(true);
    expect(tabs.some((tab) => tab.label === 'My Shift' && tab.href === '/shifts')).toBe(true);
    expect(tabs.some((tab) => tab.label === 'Account' && tab.href === CASHIER_MY_ACCOUNT_HREF)).toBe(true);
    expect(tabs.some((tab) => tab.label === 'Products')).toBe(false);
    expect(tabs.some((tab) => tab.href === '/products')).toBe(false);
    expect(tabs.some((tab) => tab.href === '/reports')).toBe(false);
    expect(tabs.some((tab) => tab.href === '/settings')).toBe(false);
    expect(tabs.some((tab) => tab.href === '/users')).toBe(false);
  });

  it('keeps cashier drawer short and role-specific', () => {
    const cashierItems = getCashierMenu(cashierContext, MOBILE_TAB_NAV_HREFS_BY_ROLE.CASHIER);
    const forbiddenDrawerHrefs = ['/products', '/inventory', '/purchases', '/reports', '/settings', '/users'];

    expect(cashierItems.map((item) => item.href)).toEqual(
      CASHIER_HAS_MY_ACCOUNT_ROUTE ? [] : [CASHIER_MY_ACCOUNT_HREF],
    );
    expect(CASHIER_MENU_ITEMS.map((item) => item.href)).not.toContain('/products');
    expect(forbiddenDrawerHrefs.every((href) => !CASHIER_MENU_ITEMS.some((item) => item.href === href))).toBe(true);
    expect(mobileMenu).toContain('isCashierCompactDrawer');
    expect(mobileMenu).toContain('nav-mobile-panel-compact');
    expect(mobileMenu).toContain("data-mobile-drawer-variant={isCashierCompactDrawer ? 'cashier-compact'");
    expect(mobileMenu).toContain('renderCashierCompactBody');
    expect(mobileMenu).toContain('Help & support');
    expect(mobileMenu).toContain('Sign out');
    expect(mobileMenu).not.toContain("user.role === 'CASHIER' ? (\n              <div className=\"grid gap-2\">");
    expect(mobileMenu).toContain("user.role === 'OWNER' && ownerMenu");
  });

  it('uses a compact content-height cashier drawer instead of an empty launcher body', () => {
    expect(read('app/globals.css')).toContain('.nav-mobile-panel-compact');
    expect(mobileMenu).toContain('Use the tabs below for POS, My Sales, My Shift, and Account');
    expect(mobileMenu).toContain('renderCashierCompactBody()');
    expect(mobileMenu).toContain("isCashierCompactDrawer ? 'flex flex-col' : 'flex h-full flex-col'");
  });

  it('keeps manager drawer operational without owner-only admin', () => {
    const sections = getManagerMenu(managerContext);
    const hrefs = sections.flatMap((section) => section.items.map((item) => item.href));

    expect(hrefs).toEqual(
      expect.arrayContaining(['/products', '/customers', '/suppliers', '/reports', '/settings', '/account']),
    );
    expect(hrefs).not.toContain('/users');
    expect(hrefs).not.toContain('/help');
    expect(mobileMenu).toContain("data-mobile-drawer-variant={isCashierCompactDrawer ? 'cashier-compact' : user.role === 'OWNER' ? 'owner-launcher' : 'manager-menu'}");
    expect(MANAGER_MENU_SECTIONS.flatMap((section) => section.items).some((item) => item.href === '/users')).toBe(
      false,
    );
  });

  it('hides bottom-tab duplicates from the mobile drawer per role', () => {
    expect(MOBILE_TAB_NAV_HREFS_BY_ROLE.OWNER).toEqual(['/sales', '/inventory', '/reports']);
    expect(MOBILE_TAB_NAV_HREFS_BY_ROLE.MANAGER).toEqual(['/pos', '/sales', '/inventory', '/purchases']);
    expect(MOBILE_TAB_NAV_HREFS_BY_ROLE.CASHIER).toEqual(
      CASHIER_HAS_MY_ACCOUNT_ROUTE
        ? ['/pos', CASHIER_MY_SALES_ROUTE, '/shifts', CASHIER_MY_ACCOUNT_HREF]
        : ['/pos', CASHIER_MY_SALES_ROUTE, '/shifts', '/help'],
    );
    expect(mobileMenu).toContain('MOBILE_TAB_NAV_HREFS_BY_ROLE');
  });

  it('preserves desktop route permissions and POS logic', () => {
    expect(NAV_GROUPS.find((group) => group.id === 'reports')?.sections?.length).toBeGreaterThan(0);
    expect(read('app/(protected)/sales/page.tsx')).toContain("requireBusiness(['MANAGER', 'OWNER'])");
    expect(read('app/(protected)/my-sales/page.tsx')).toContain("requireBusiness(['CASHIER', 'MANAGER', 'OWNER'])");
    expect(read('app/(protected)/my-sales/page.tsx')).toContain("redirect('/sales')");
    expect(read('app/(protected)/sales/return/[id]/page.tsx')).toContain("requireBusiness(['MANAGER', 'OWNER'])");
    expect(read('app/actions/returns.ts')).toContain("withBusinessContext(['MANAGER', 'OWNER'])");
    expect(read('app/(protected)/pos/page.tsx')).not.toContain('mobile-menu-config');
    expect(read('app/actions/sales.ts')).toContain('export async function completeSaleAction');
  });

  it('uses role-aware bottom tabs from the mobile menu config', () => {
    expect(bottomTabBar).toContain('getBottomTabsForRole');
    expect(bottomTabBar).not.toContain('homeHrefForRole');
  });

  it('keeps business-friendly settings copy', () => {
    expect(OWNER_QUICK_ACTIONS).toEqual(
      expect.arrayContaining([expect.objectContaining({ href: '/settings', label: 'Business settings' })]),
    );
    expect(mobileMenu).toContain('Help & support');
    expect(mobileMenu).toContain('Sign out');
    const quickActionBlock = mobileMenu.slice(
      mobileMenu.indexOf('const renderQuickActionTile'),
      mobileMenu.indexOf('const renderBrowseArea'),
    );
    expect(quickActionBlock).toContain('[overflow-wrap:anywhere]');
    expect(quickActionBlock).not.toContain('truncate');
  });
});

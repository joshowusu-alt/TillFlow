import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getCashierMenu,
  getManagerMenu,
  getOwnerLauncherMenu,
  MANAGER_MENU_SECTIONS,
  OWNER_BROWSE_AREAS,
} from '@/lib/navigation/mobile-menu-config';
import { NAV_GROUPS } from '@/lib/navigation-config';
import { getFeatures } from '@/lib/features';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const ownerWithStorefront = {
  role: 'OWNER' as const,
  features: getFeatures('PRO', 'MULTI_STORE', { onlineStorefront: true }),
  momoEnabled: true,
};

const ownerWithoutStorefront = {
  role: 'OWNER' as const,
  // Growth without storefront add-on — Pro always includes storefront.
  features: getFeatures('GROWTH', 'SINGLE_STORE', { onlineStorefront: false }),
  momoEnabled: true,
};

const managerWithStorefront = {
  role: 'MANAGER' as const,
  features: getFeatures('GROWTH', 'SINGLE_STORE', { onlineStorefront: true }),
  momoEnabled: true,
};

const managerWithoutStorefront = {
  role: 'MANAGER' as const,
  features: getFeatures('GROWTH', 'SINGLE_STORE', { onlineStorefront: false }),
  momoEnabled: true,
};

const cashierContext = {
  role: 'CASHIER' as const,
  features: getFeatures('PRO', 'MULTI_STORE', { onlineStorefront: true }),
  momoEnabled: true,
};

function desktopItem(href: string) {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((entry) => entry.href === href);
    if (item) return item;
  }
  return null;
}

function ownerHrefs(ctx = ownerWithStorefront) {
  return getOwnerLauncherMenu(ctx).browseAreas.flatMap((area) => area.items.map((item) => item.href));
}

function managerHrefs(ctx = managerWithStorefront) {
  return getManagerMenu(ctx).flatMap((section) => section.items.map((item) => item.href));
}

describe('P2 mobile navigation parity', () => {
  it('exposes Product Labels to Owner and Manager mobile menus, not Cashier', () => {
    expect(ownerHrefs()).toContain('/products/labels');
    expect(managerHrefs()).toContain('/products/labels');
    expect(getCashierMenu(cashierContext).map((item) => item.href)).not.toContain('/products/labels');

    const ownerLabels = OWNER_BROWSE_AREAS.flatMap((a) => a.items).find((i) => i.href === '/products/labels');
    const managerLabels = MANAGER_MENU_SECTIONS.flatMap((a) => a.items).find((i) => i.href === '/products/labels');
    expect(ownerLabels?.roles).toEqual(['OWNER']);
    expect(managerLabels?.roles).toEqual(['MANAGER']);
    expect(ownerLabels?.minimumPlan).toBe('GROWTH');
    expect(managerLabels?.minimumPlan).toBe('GROWTH');
    expect(ownerLabels?.roles).not.toContain('CASHIER');
    expect(managerLabels?.roles).not.toContain('CASHIER');
  });

  it('places Product Labels in Stock sections for Owner and Manager', () => {
    const ownerStock = OWNER_BROWSE_AREAS.find((area) => area.id === 'stock-suppliers');
    const managerStock = MANAGER_MENU_SECTIONS.find((area) => area.id === 'stock');
    expect(ownerStock?.items.some((item) => item.href === '/products/labels')).toBe(true);
    expect(managerStock?.items.some((item) => item.href === '/products/labels')).toBe(true);
  });

  it('exposes Manager Online Orders only when Storefront is enabled', () => {
    expect(managerHrefs(managerWithStorefront)).toContain('/online-orders');
    expect(managerHrefs(managerWithoutStorefront)).not.toContain('/online-orders');

    const managerOrders = MANAGER_MENU_SECTIONS.flatMap((a) => a.items).find((i) => i.href === '/online-orders');
    expect(managerOrders?.requiresFeature).toBe('onlineStorefront');
    expect(managerOrders?.roles).toEqual(['MANAGER']);
  });

  it('preserves Owner Online Orders entitlement gating without regressing enabled discovery', () => {
    expect(ownerHrefs(ownerWithStorefront)).toContain('/online-orders');
    expect(ownerHrefs(ownerWithoutStorefront)).not.toContain('/online-orders');

    const ownerOrders = OWNER_BROWSE_AREAS.flatMap((a) => a.items).find((i) => i.href === '/online-orders');
    expect(ownerOrders?.requiresFeature).toBe('onlineStorefront');
    expect(ownerOrders?.roles).toEqual(['OWNER']);
  });

  it('exposes Stock Movements to Owner and Manager only', () => {
    expect(ownerHrefs()).toContain('/reports/stock-movements');
    expect(managerHrefs()).toContain('/reports/stock-movements');
    expect(getCashierMenu(cashierContext).map((item) => item.href)).not.toContain('/reports/stock-movements');

    const stockPage = read('app/(protected)/reports/stock-movements/page.tsx');
    expect(stockPage).toContain("requireBusiness(['MANAGER', 'OWNER'])");
  });

  it('keeps Supplier Ageing discoverable for Owner and Manager (P1 regression)', () => {
    expect(ownerHrefs()).toContain('/payments/supplier-aging');
    expect(managerHrefs()).toContain('/payments/supplier-aging');
    expect(getCashierMenu(cashierContext).map((item) => item.href)).not.toContain('/payments/supplier-aging');
  });

  it('does not expose Owner-only admin destinations to Manager or Cashier mobile menus', () => {
    expect(managerHrefs()).not.toContain('/users');
    expect(managerHrefs()).not.toContain('/settings/billing');
    expect(managerHrefs()).not.toContain('/settings/backup');
    expect(managerHrefs()).not.toContain('/settings/data-repair');
    expect(getCashierMenu(cashierContext).map((item) => item.href)).not.toContain('/users');
    expect(getCashierMenu(cashierContext).map((item) => item.href)).not.toContain('/settings');
    expect(getCashierMenu(cashierContext).map((item) => item.href)).not.toContain('/settings/billing');
  });

  it('keeps mobile P2 destinations within desktop-authorised roles (nav is not auth)', () => {
    const watched = ['/products/labels', '/online-orders', '/reports/stock-movements', '/payments/supplier-aging'];
    const mobileItems = [
      ...OWNER_BROWSE_AREAS.flatMap((area) => area.items),
      ...MANAGER_MENU_SECTIONS.flatMap((area) => area.items),
    ].filter((item) => watched.includes(item.href));

    for (const item of mobileItems) {
      const desktop = desktopItem(item.href);
      expect(desktop, `missing desktop NAV_GROUPS entry for ${item.href}`).not.toBeNull();
      for (const role of item.roles) {
        expect(desktop!.roles).toContain(role);
      }
    }
  });

  it('does not regress desktop Stock / Sell entries for labels, online orders, and stock movements', () => {
    expect(desktopItem('/products/labels')?.roles).toEqual(expect.arrayContaining(['MANAGER', 'OWNER']));
    expect(desktopItem('/online-orders')?.roles).toEqual(expect.arrayContaining(['MANAGER', 'OWNER']));
    expect(desktopItem('/online-orders')?.requiresFeature).toBe('onlineStorefront');
    expect(desktopItem('/reports/stock-movements')?.roles).toEqual(expect.arrayContaining(['MANAGER', 'OWNER']));

    // Desktop still lists Cashier for labels; P2 must not add Cashier mobile nav.
    expect(desktopItem('/products/labels')?.roles).toContain('CASHIER');
    expect(MANAGER_MENU_SECTIONS.flatMap((a) => a.items).some((i) => i.href === '/products/labels' && i.roles.includes('CASHIER'))).toBe(
      false,
    );
  });

  it('keeps route guards as the authority for Online Orders and Product Labels', () => {
    expect(read('app/(protected)/online-orders/page.tsx')).toContain("requireBusiness(['MANAGER', 'OWNER'])");
    expect(read('app/(protected)/products/labels/page.tsx')).toContain("requireBusiness(['CASHIER', 'MANAGER', 'OWNER'])");
  });
});

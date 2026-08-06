import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CRITICAL_MOBILE_OPERATIONAL_HREFS,
  getCashierMenu,
  getManagerMenu,
  getOwnerLauncherMenu,
  MANAGER_MENU_SECTIONS,
  OWNER_BROWSE_AREAS,
} from '@/lib/navigation/mobile-menu-config';
import { NAV_GROUPS } from '@/lib/navigation-config';
import { getFeatures } from '@/lib/features';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const ownerContext = {
  role: 'OWNER' as const,
  features: getFeatures('PRO', 'MULTI_STORE', { onlineStorefront: true }),
  momoEnabled: true,
};

const managerContext = {
  role: 'MANAGER' as const,
  features: getFeatures('PRO', 'MULTI_STORE'),
  momoEnabled: true,
};

const cashierContext = {
  role: 'CASHIER' as const,
  features: getFeatures('STARTER', 'SINGLE_STORE'),
  momoEnabled: true,
};

const starterOwnerContext = {
  role: 'OWNER' as const,
  features: getFeatures('STARTER', 'SINGLE_STORE'),
  momoEnabled: false,
};

function desktopRolesForHref(href: string) {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((entry) => entry.href === href);
    if (item) return item.roles;
  }
  // Expense payments is authorised for Manager/Owner but not listed in desktop NAV_GROUPS.
  if (href === '/payments/expense-payments') return ['MANAGER', 'OWNER'] as const;
  return null;
}

describe('P1 mobile navigation parity', () => {
  it('exposes critical Owner Money and Stock routes directly in mobile browse areas', () => {
    const ownerMenu = getOwnerLauncherMenu(ownerContext);
    const money = ownerMenu.browseAreas.find((area) => area.id === 'money');
    const stock = ownerMenu.browseAreas.find((area) => area.id === 'stock-suppliers');
    const moneyHrefs = money?.items.map((item) => item.href) ?? [];
    const stockHrefs = stock?.items.map((item) => item.href) ?? [];
    const allHrefs = ownerMenu.browseAreas.flatMap((area) => area.items.map((item) => item.href));

    expect(moneyHrefs).toEqual(
      expect.arrayContaining([
        '/expenses',
        '/payments/expense-payments',
        '/reports/cash-drawer',
        '/payments/customer-receipts',
        '/payments/supplier-payments',
        '/payments/supplier-aging',
        '/payments/reconciliation',
        '/payments/reconciliation/card-transfer',
      ]),
    );
    expect(stockHrefs).toEqual(
      expect.arrayContaining([
        '/inventory/adjustments',
        '/inventory/stocktake',
        '/reports/stock-movements',
        '/products/labels',
        '/transfers',
      ]),
    );

    for (const href of CRITICAL_MOBILE_OPERATIONAL_HREFS) {
      expect(allHrefs).toContain(href);
    }
  });

  it('exposes critical Manager Money and Stock routes directly in mobile sections', () => {
    const sections = getManagerMenu(managerContext);
    const money = sections.find((area) => area.id === 'money');
    const stock = sections.find((area) => area.id === 'stock');
    const allHrefs = sections.flatMap((section) => section.items.map((item) => item.href));

    expect(MANAGER_MENU_SECTIONS.map((section) => section.id)).toEqual(
      expect.arrayContaining(['operations', 'stock', 'money', 'people', 'reports-settings']),
    );
    expect(money?.items.map((item) => item.href)).toEqual(
      expect.arrayContaining([
        '/expenses',
        '/payments/expense-payments',
        '/reports/cash-drawer',
        '/payments/customer-receipts',
        '/payments/supplier-payments',
        '/payments/supplier-aging',
        '/payments/reconciliation',
        '/payments/reconciliation/card-transfer',
      ]),
    );
    expect(stock?.items.map((item) => item.href)).toEqual(
      expect.arrayContaining([
        '/inventory/adjustments',
        '/inventory/stocktake',
        '/reports/stock-movements',
        '/products/labels',
        '/transfers',
      ]),
    );

    for (const href of CRITICAL_MOBILE_OPERATIONAL_HREFS) {
      expect(allHrefs).toContain(href);
    }
  });

  it('keeps Cashier mobile navigation free of Money and Stock operational routes', () => {
    const cashierHrefs = getCashierMenu(cashierContext).map((item) => item.href);

    for (const href of CRITICAL_MOBILE_OPERATIONAL_HREFS) {
      expect(cashierHrefs).not.toContain(href);
    }
    expect(cashierHrefs).not.toContain('/inventory');
    expect(cashierHrefs).not.toContain('/expenses');
    expect(cashierHrefs).not.toContain('/users');
  });

  it('does not expose mobile Money/Stock links beyond desktop-authorised roles', () => {
    const mobileItems = [
      ...OWNER_BROWSE_AREAS.flatMap((area) => area.items),
      ...MANAGER_MENU_SECTIONS.flatMap((area) => area.items),
    ].filter((item) => (CRITICAL_MOBILE_OPERATIONAL_HREFS as readonly string[]).includes(item.href));

    for (const item of mobileItems) {
      const desktopRoles = desktopRolesForHref(item.href);
      expect(desktopRoles, `missing desktop policy for ${item.href}`).not.toBeNull();
      for (const role of item.roles) {
        expect(desktopRoles).toContain(role);
      }
      expect(item.roles).not.toContain('CASHIER');
    }
  });

  it('preserves plan and MoMo gates on stocktake and reconciliation', () => {
    const stocktake = OWNER_BROWSE_AREAS.flatMap((area) => area.items).find(
      (item) => item.href === '/inventory/stocktake',
    );
    expect(stocktake?.minimumPlan).toBe('GROWTH');

    const starterOwner = getOwnerLauncherMenu(starterOwnerContext);
    const starterHrefs = starterOwner.browseAreas.flatMap((area) => area.items.map((item) => item.href));
    expect(starterHrefs).not.toContain('/payments/reconciliation');
    expect(starterHrefs).not.toContain('/transfers');
  });

  it('keeps Supplier Ageing in Money while Reports Hub remains available', () => {
    const ownerMoney = OWNER_BROWSE_AREAS.find((area) => area.id === 'money');
    const ownerReports = OWNER_BROWSE_AREAS.find((area) => area.id === 'reports');
    expect(ownerMoney?.items.some((item) => item.href === '/payments/supplier-aging')).toBe(true);
    expect(ownerReports?.items.some((item) => item.href === '/reports')).toBe(true);
  });
});

describe('P1 ResponsiveDataTable and operational mobile lists', () => {
  it('requires an explicit responsive mode contract', () => {
    const src = read('components/ResponsiveDataTable.tsx');
    expect(src).toContain("mode: 'cards'");
    expect(src).toContain("mode: 'dense-ledger'");
    expect(src).toContain("mode: 'desktop-only'");
    expect(src).toContain('requires a mobile renderer');
    expect(src).not.toContain("mode = 'table'");
  });

  it('adapts MoMo reconciliation for mobile cards', () => {
    const src = read('app/(protected)/payments/reconciliation/page.tsx');
    expect(src).toContain('mode="cards"');
    expect(src).toContain('mobile={');
    expect(src).toContain('DataCard');
    expect(src).toContain('Re-check');
    expect(src).toContain('Re-initiate');
    expect(src).toContain('requireBusiness([\'MANAGER\', \'OWNER\'])');
  });

  it('adapts card/transfer reconciliation for mobile cards', () => {
    const src = read('app/(protected)/payments/reconciliation/card-transfer/page.tsx');
    expect(src).toContain('mode="cards"');
    expect(src).toContain('mobile={');
    expect(src).toContain('DataCard');
    expect(src).toContain('ReconcileForm');
    expect(src).toContain('View transactions');
  });

  it('adapts expense payments for mobile cards', () => {
    const src = read('app/(protected)/payments/expense-payments/page.tsx');
    expect(src).toContain('mode="cards"');
    expect(src).toContain('mobile={');
    expect(src).toContain('DataCard');
    expect(src).toContain('Record payment');
    expect(src).toContain('recordExpensePaymentAction');
  });

  it('adapts customer invoice history for mobile cards', () => {
    const src = read('app/(protected)/customers/[id]/page.tsx');
    expect(src).toContain('mode="cards"');
    expect(src).toContain('DataCard');
    expect(src).toContain('Print receipt');
    expect(src).toContain('Record payment');
    expect(src).toContain('dueDate: true');
  });

  it('keeps supplier ageing mobile cards and Money discovery intact', () => {
    const src = read('app/(protected)/payments/supplier-aging/page.tsx');
    expect(src).toContain('lg:hidden');
    expect(src).toContain('DataCard');
    expect(src).toContain('Record payment');
    expect(src).toContain('getSupplierAgingReport');
    expect(src).toContain('AGING_BUCKETS');
  });

  it('rejects desktop-only traps on P1 operational list call sites', () => {
    const pages = [
      'app/(protected)/payments/reconciliation/page.tsx',
      'app/(protected)/payments/reconciliation/card-transfer/page.tsx',
      'app/(protected)/payments/expense-payments/page.tsx',
      'app/(protected)/customers/[id]/page.tsx',
      'app/(protected)/payments/customer-receipts/page.tsx',
      'app/(protected)/payments/supplier-payments/page.tsx',
      'app/(protected)/transfers/page.tsx',
    ];

    for (const path of pages) {
      const src = read(path);
      expect(src, path).toContain('mode="cards"');
      expect(src, path).toContain('mobile=');
    }
  });
});

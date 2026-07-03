import type { BusinessPlan, getFeatures } from '@/lib/features';
import type { AppRole, FeatureKey, NavIconKey, NavigationItem } from '@/lib/navigation-config';
import { CASHIER_MY_SALES_ROUTE } from '@/lib/services/cashier-my-sales';
export type MobileNavContext = {
  role: AppRole;
  features: ReturnType<typeof getFeatures>;
  momoEnabled: boolean;
};

export type MobileNavLink = {
  href: string;
  label: string;
  iconKey?: NavIconKey;
  minimumPlan?: BusinessPlan;
  requiresFeature?: FeatureKey;
  roles: AppRole[];
};

export type OwnerQuickAction = MobileNavLink & { id: string };

export type MobileBrowseArea = {
  id: string;
  label: string;
  description?: string;
  items: MobileNavLink[];
};

export type BottomTabDefinition = {
  label: string;
  icon: 'home' | 'pos' | 'sales' | 'inventory' | 'reports' | 'purchases' | 'shift' | 'account' | 'help' | 'more';
  href?: string;
  opensMenu?: boolean;
  match?: (pathname: string) => boolean;
};

/** Existing protected profile route for cashiers (`/account`). */
export const CASHIER_MY_ACCOUNT_HREF = '/account';

/** When false, cashier bottom nav uses Help instead of Account. */
export const CASHIER_HAS_MY_ACCOUNT_ROUTE = true;

export const OWNER_QUICK_ACTIONS: OwnerQuickAction[] = [
  {
    id: 'open-pos',
    href: '/pos',
    label: 'Open POS',
    iconKey: 'pos',
    roles: ['OWNER'],
  },
  {
    id: 'sales',
    href: '/sales',
    label: 'Sales',
    iconKey: 'sales',
    roles: ['OWNER'],
  },
  {
    id: 'inventory',
    href: '/inventory',
    label: 'Inventory',
    iconKey: 'inventory',
    roles: ['OWNER'],
  },
  {
    id: 'purchases',
    href: '/purchases',
    label: 'Purchases',
    iconKey: 'purchases',
    roles: ['OWNER'],
  },
  {
    id: 'reports',
    href: '/reports',
    label: 'Reports',
    iconKey: 'reportsHub',
    roles: ['OWNER'],
  },
  {
    id: 'business-settings',
    href: '/settings',
    label: 'Business settings',
    iconKey: 'settings',
    roles: ['OWNER'],
  },
];

export const OWNER_BROWSE_AREAS: MobileBrowseArea[] = [
  {
    id: 'daily-work',
    label: 'Daily work',
    description: 'Sell, serve customers, and run the till.',
    items: [
      { href: '/pos', label: 'POS', iconKey: 'pos', roles: ['OWNER'] },
      { href: '/sales', label: 'Sales', iconKey: 'sales', roles: ['OWNER'] },
      { href: '/products', label: 'Products', iconKey: 'products', roles: ['OWNER'] },
      { href: '/shifts', label: 'Shifts', iconKey: 'shifts', roles: ['OWNER'] },
    ],
  },
  {
    id: 'stock-suppliers',
    label: 'Stock & suppliers',
    description: 'Receive stock and manage supplier activity.',
    items: [
      { href: '/inventory', label: 'Inventory', iconKey: 'inventory', roles: ['OWNER'] },
      { href: '/purchases', label: 'Purchases', iconKey: 'purchases', roles: ['OWNER'] },
      { href: '/suppliers', label: 'Suppliers', iconKey: 'suppliers', roles: ['OWNER'] },
      { href: '/transfers', label: 'Transfers', iconKey: 'transfers', roles: ['OWNER'] },
    ],
  },
  {
    id: 'money',
    label: 'Money',
    description: 'Track cash, payments, and expenses.',
    items: [
      { href: '/expenses', label: 'Expenses', iconKey: 'expenses', roles: ['OWNER'] },
      { href: '/reports/cash-drawer', label: 'Cash drawer', iconKey: 'cashDrawer', roles: ['OWNER'] },
      { href: '/payments/customer-receipts', label: 'Customer payments', iconKey: 'payments', roles: ['OWNER'] },
      { href: '/payments/supplier-payments', label: 'Supplier payments', iconKey: 'payments', roles: ['OWNER'] },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    description: 'Review performance and make decisions.',
    items: [
      { href: '/reports', label: 'Reports Hub', iconKey: 'reportsHub', roles: ['OWNER'] },
      { href: '/reports/owner', label: 'Owner Brief', iconKey: 'ownerBrief', roles: ['OWNER'], minimumPlan: 'PRO' },
      { href: '/reports/analytics', label: 'Analytics', iconKey: 'analytics', roles: ['OWNER'], minimumPlan: 'GROWTH' },
    ],
  },
  {
    id: 'online-customers',
    label: 'Online & customers',
    description: 'Serve online orders and customer accounts.',
    items: [
      {
        href: '/online-orders',
        label: 'Online Orders',
        iconKey: 'orders',
        roles: ['OWNER'],
        requiresFeature: 'onlineStorefront',
      },
      { href: '/customers', label: 'Customers', iconKey: 'customers', roles: ['OWNER'] },
      { href: '/settings/online-store', label: 'Storefront', iconKey: 'orders', roles: ['OWNER'], minimumPlan: 'PRO' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    description: 'People, settings, and support.',
    items: [
      { href: '/users', label: 'Users', iconKey: 'users', roles: ['OWNER'] },
      { href: '/settings', label: 'Business settings', iconKey: 'settings', roles: ['OWNER'] },
      { href: '/account', label: 'My Account', iconKey: 'account', roles: ['OWNER'] },
      { href: '/help', label: 'Help', iconKey: 'setup', roles: ['OWNER'] },
    ],
  },
];

export const MANAGER_MENU_SECTIONS: MobileBrowseArea[] = [
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { href: '/pos', label: 'POS', iconKey: 'pos', roles: ['MANAGER'] },
      { href: '/sales', label: 'Sales', iconKey: 'sales', roles: ['MANAGER'] },
      { href: '/inventory', label: 'Inventory', iconKey: 'inventory', roles: ['MANAGER'] },
      { href: '/purchases', label: 'Purchases', iconKey: 'purchases', roles: ['MANAGER'] },
      { href: '/products', label: 'Products', iconKey: 'products', roles: ['MANAGER'] },
      { href: '/shifts', label: 'Shifts', iconKey: 'shifts', roles: ['MANAGER'] },
    ],
  },
  {
    id: 'people',
    label: 'Customers & suppliers',
    items: [
      { href: '/customers', label: 'Customers', iconKey: 'customers', roles: ['MANAGER'] },
      { href: '/suppliers', label: 'Suppliers', iconKey: 'suppliers', roles: ['MANAGER'] },
    ],
  },
  {
    id: 'reports-settings',
    label: 'Reports & settings',
    items: [
      { href: '/reports', label: 'Reports Hub', iconKey: 'reportsHub', roles: ['MANAGER'] },
      { href: '/settings', label: 'Business settings', iconKey: 'settings', roles: ['MANAGER'] },
      { href: '/account', label: 'My Account', iconKey: 'account', roles: ['MANAGER'] },
      { href: '/help', label: 'Help & support', iconKey: 'setup', roles: ['MANAGER'] },
    ],
  },
];

/** Drawer-only cashier links (bottom-tab destinations are excluded via hidden hrefs). */
export const CASHIER_MENU_ITEMS: MobileNavLink[] = CASHIER_HAS_MY_ACCOUNT_ROUTE
  ? []
  : [{ href: CASHIER_MY_ACCOUNT_HREF, label: 'My Account', iconKey: 'account', roles: ['CASHIER'] }];

/** Bottom-tab routes duplicated in the mobile drawer for each role. */
export const MOBILE_TAB_NAV_HREFS_BY_ROLE: Record<AppRole, readonly string[]> = {
  OWNER: ['/sales', '/inventory', '/reports'],
  MANAGER: ['/pos', '/sales', '/inventory', '/purchases'],
  CASHIER: CASHIER_HAS_MY_ACCOUNT_ROUTE
    ? ['/pos', CASHIER_MY_SALES_ROUTE, '/shifts', CASHIER_MY_ACCOUNT_HREF]
    : ['/pos', CASHIER_MY_SALES_ROUTE, '/shifts', '/help'],
};

export function itemIsVisible(item: Pick<MobileNavLink, 'roles' | 'href' | 'requiresFeature'>, context: MobileNavContext) {
  if (!item.roles.includes(context.role)) return false;
  if (!context.features.multiStore && item.href === '/transfers') return false;
  if (context.momoEnabled === false && item.href === '/payments/reconciliation') return false;
  return true;
}

export function filterBrowseArea(area: MobileBrowseArea, context: MobileNavContext, hiddenHrefs: readonly string[] = []) {
  const items = area.items.filter(
    (item) => itemIsVisible(item, context) && !hiddenHrefs.includes(item.href),
  );
  return items.length > 0 ? { ...area, items } : null;
}

export function getOwnerLauncherMenu(context: MobileNavContext, hiddenHrefs: readonly string[] = []) {
  return {
    quickActions: OWNER_QUICK_ACTIONS.filter((item) => itemIsVisible(item, context)),
    browseAreas: OWNER_BROWSE_AREAS.map((area) => filterBrowseArea(area, context, hiddenHrefs)).filter(
      (area): area is MobileBrowseArea => area !== null,
    ),
  };
}

export function getManagerMenu(context: MobileNavContext, hiddenHrefs: readonly string[] = []) {
  return MANAGER_MENU_SECTIONS.map((area) => filterBrowseArea(area, context, hiddenHrefs)).filter(
    (area): area is MobileBrowseArea => area !== null,
  );
}

export function getCashierMenu(context: MobileNavContext, hiddenHrefs: readonly string[] = []) {
  return CASHIER_MENU_ITEMS.filter((item) => itemIsVisible(item, context) && !hiddenHrefs.includes(item.href));
}

export function collectMobileNavGates(items: Array<Pick<NavigationItem, 'href' | 'minimumPlan' | 'requiresFeature'>>) {
  const planGated = new Map<string, BusinessPlan>();
  const featureGated = new Map<string, FeatureKey>();

  for (const item of items) {
    if (item.minimumPlan) planGated.set(item.href, item.minimumPlan);
    if (item.requiresFeature) featureGated.set(item.href, item.requiresFeature);
  }

  return { planGated, featureGated };
}

export function getAllMobileNavGateItems() {
  return [
    ...OWNER_QUICK_ACTIONS,
    ...OWNER_BROWSE_AREAS.flatMap((area) => area.items),
    ...MANAGER_MENU_SECTIONS.flatMap((area) => area.items),
    ...CASHIER_MENU_ITEMS,
  ];
}

export function getBottomTabsForRole(role: AppRole): BottomTabDefinition[] {
  const openMenuTab: BottomTabDefinition = {
    label: 'More',
    icon: 'more',
    opensMenu: true,
    match: () => false,
  };

  if (role === 'OWNER') {
    return [
      {
        label: 'Home',
        icon: 'home',
        href: '/onboarding',
        match: (pathname) => pathname === '/onboarding' || pathname === '/',
      },
      {
        label: 'Sales',
        icon: 'sales',
        href: '/sales',
        match: (pathname) => pathname === '/sales' || pathname.startsWith('/sales/'),
      },
      {
        label: 'Inventory',
        icon: 'inventory',
        href: '/inventory',
        match: (pathname) => pathname === '/inventory' || pathname.startsWith('/inventory/'),
      },
      {
        label: 'Reports',
        icon: 'reports',
        href: '/reports',
        match: (pathname) => pathname === '/reports' || pathname.startsWith('/reports/'),
      },
      openMenuTab,
    ];
  }

  if (role === 'MANAGER') {
    return [
      {
        label: 'POS',
        icon: 'pos',
        href: '/pos',
        match: (pathname) => pathname.startsWith('/pos'),
      },
      {
        label: 'Sales',
        icon: 'sales',
        href: '/sales',
        match: (pathname) => pathname === '/sales' || pathname.startsWith('/sales/'),
      },
      {
        label: 'Inventory',
        icon: 'inventory',
        href: '/inventory',
        match: (pathname) => pathname === '/inventory' || pathname.startsWith('/inventory/'),
      },
      {
        label: 'Purchases',
        icon: 'purchases',
        href: '/purchases',
        match: (pathname) => pathname === '/purchases' || pathname.startsWith('/purchases/'),
      },
      openMenuTab,
    ];
  }

  const posTab: BottomTabDefinition = {
    label: 'POS',
    icon: 'pos',
    href: '/pos',
    match: (pathname) => pathname.startsWith('/pos'),
  };

  const mySalesTab: BottomTabDefinition = {
    label: 'My Sales',
    icon: 'sales',
    href: CASHIER_MY_SALES_ROUTE,
    match: (pathname) => pathname === CASHIER_MY_SALES_ROUTE || pathname.startsWith(`${CASHIER_MY_SALES_ROUTE}/`),
  };

  const myShiftTab: BottomTabDefinition = {
    label: 'My Shift',
    icon: 'shift',
    href: '/shifts',
    match: (pathname) => pathname.startsWith('/shifts'),
  };

  const accountTab: BottomTabDefinition = CASHIER_HAS_MY_ACCOUNT_ROUTE
    ? {
        label: 'Account',
        icon: 'account',
        href: CASHIER_MY_ACCOUNT_HREF,
        match: (pathname) => pathname === CASHIER_MY_ACCOUNT_HREF || pathname.startsWith(`${CASHIER_MY_ACCOUNT_HREF}/`),
      }
    : {
        label: 'Help',
        icon: 'help',
        href: '/help',
        match: (pathname) => pathname === '/help' || pathname.startsWith('/help/'),
      };

  return [posTab, mySalesTab, myShiftTab, accountTab, openMenuTab];
}

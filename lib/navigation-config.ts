import type { BusinessPlan, getFeatures } from './features';

export type AppRole = 'CASHIER' | 'MANAGER' | 'OWNER';

/** Boolean feature keys exposed by getFeatures() that a nav item can gate on. */
export type FeatureKey = {
  [K in keyof ReturnType<typeof getFeatures>]: ReturnType<typeof getFeatures>[K] extends boolean ? K : never;
}[keyof ReturnType<typeof getFeatures>];

export function getFeatureLockLabel(feature: FeatureKey, plan: BusinessPlan) {
  return feature === 'onlineStorefront' && plan === 'GROWTH' ? 'ADD-ON' : 'UPGRADE';
}

export type NavigationItem = {
  href: string;
  label: string;
  roles: AppRole[];
  minimumPlan?: BusinessPlan;
  /**
   * Gate this link on a computed feature (e.g. the Online Storefront add-on)
   * rather than a plan rank. Feature gating is add-on aware, so Growth + add-on
   * is treated as entitled instead of showing a misleading PRO lock.
   */
  requiresFeature?: FeatureKey;
};

export type NavigationSection = {
  id: string;
  label: string;
  items: NavigationItem[];
};

export type NavigationGroup = {
  id: string;
  label: string;
  items: NavigationItem[];
  sections?: NavigationSection[];
};

export type SettingsTabSection = {
  id: string;
  label: string;
  items: NavigationItem[];
};

export const REPORT_NAV_SECTIONS: NavigationSection[] = [
  {
    id: 'main',
    label: 'Main',
    items: [
      { href: '/reports/command-center', label: 'Command Center', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/dashboard', label: 'Trading Report', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/weekly-digest', label: 'Weekly Digest', roles: ['MANAGER', 'OWNER'] },
    ],
  },
  {
    id: 'sales-stock',
    label: 'Sales & Stock',
    items: [
      { href: '/reports/analytics', label: 'Sales Analytics', roles: ['MANAGER', 'OWNER'], minimumPlan: 'GROWTH' },
      { href: '/reports/margins', label: 'Profit Margins', roles: ['MANAGER', 'OWNER'], minimumPlan: 'GROWTH' },
      { href: '/reports/sales-by-supplier', label: 'Sales by Linked Supplier', roles: ['MANAGER', 'OWNER'], minimumPlan: 'GROWTH' },
      { href: '/reports/reorder-suggestions', label: 'Reorder Suggestions', roles: ['MANAGER', 'OWNER'], minimumPlan: 'GROWTH' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      { href: '/reports/income-statement', label: 'Income Statement', roles: ['MANAGER', 'OWNER'], minimumPlan: 'GROWTH' },
      { href: '/reports/balance-sheet', label: 'Balance Sheet', roles: ['MANAGER', 'OWNER'], minimumPlan: 'GROWTH' },
      { href: '/reports/cashflow', label: 'Cash Flow', roles: ['MANAGER', 'OWNER'], minimumPlan: 'GROWTH' },
      { href: '/reports/cash-drawer', label: 'Cash Drawer', roles: ['MANAGER', 'OWNER'] },
    ],
  },
  {
    id: 'control',
    label: 'Control',
    items: [
      { href: '/reports/risk-monitor', label: 'Risk Monitor', roles: ['MANAGER', 'OWNER'], minimumPlan: 'GROWTH' },
      { href: '/reports/audit-log', label: 'Audit Log', roles: ['OWNER'], minimumPlan: 'PRO' },
      { href: '/reports/exports', label: 'Exports', roles: ['MANAGER', 'OWNER'] },
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    items: [
      { href: '/reports/owner', label: 'Owner Brief', roles: ['OWNER'], minimumPlan: 'PRO' },
      { href: '/reports/cashflow-forecast', label: 'Cash Flow Forecast', roles: ['OWNER'], minimumPlan: 'PRO' },
    ],
  },
];

export const NAV_GROUPS: NavigationGroup[] = [
  {
    id: 'sell',
    label: 'Sell',
    items: [
      { href: '/pos', label: 'POS', roles: ['CASHIER', 'MANAGER', 'OWNER'] },
      { href: '/sales', label: 'Sales', roles: ['MANAGER', 'OWNER'] },
      { href: '/online-orders', label: 'Online Orders', roles: ['MANAGER', 'OWNER'], requiresFeature: 'onlineStorefront' },
      { href: '/shifts', label: 'Shifts', roles: ['CASHIER', 'MANAGER', 'OWNER'] },
    ],
  },
  {
    id: 'stock',
    label: 'Stock',
    items: [
      { href: '/inventory', label: 'Inventory', roles: ['MANAGER', 'OWNER'] },
      { href: '/inventory/adjustments', label: 'Stock Adjustments', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/stock-movements', label: 'Stock Movements', roles: ['MANAGER', 'OWNER'] },
      { href: '/purchases', label: 'Purchases', roles: ['MANAGER', 'OWNER'] },
      { href: '/transfers', label: 'Transfers', roles: ['MANAGER', 'OWNER'] },
      { href: '/products', label: 'Products', roles: ['CASHIER', 'MANAGER', 'OWNER'] },
      { href: '/products/labels', label: 'Product Labels', roles: ['CASHIER', 'MANAGER', 'OWNER'], minimumPlan: 'GROWTH' },
    ],
  },
  {
    id: 'money',
    label: 'Money',
    items: [
      { href: '/expenses', label: 'Expenses', roles: ['MANAGER', 'OWNER'] },
      { href: '/payments/customer-receipts', label: 'Customer Receipts', roles: ['MANAGER', 'OWNER'] },
      { href: '/payments/supplier-payments', label: 'Supplier Payments', roles: ['MANAGER', 'OWNER'] },
      { href: '/payments/supplier-aging', label: 'Supplier Aging', roles: ['MANAGER', 'OWNER'] },
      { href: '/payments/reconciliation', label: 'MoMo Reconciliation', roles: ['MANAGER', 'OWNER'] },
      { href: '/payments/reconciliation/card-transfer', label: 'Card/Transfer Reconciliation', roles: ['MANAGER', 'OWNER'] },
    ],
  },
  {
    id: 'relationships',
    label: 'People',
    items: [
      { href: '/customers', label: 'Customers', roles: ['MANAGER', 'OWNER'] },
      { href: '/suppliers', label: 'Suppliers', roles: ['MANAGER', 'OWNER'] },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    items: REPORT_NAV_SECTIONS.flatMap((section) => section.items),
    sections: REPORT_NAV_SECTIONS,
  },
  {
    id: 'admin',
    label: 'Admin',
    items: [
      { href: '/account', label: 'My Account', roles: ['CASHIER', 'MANAGER', 'OWNER'] },
      { href: '/settings', label: 'Settings', roles: ['MANAGER', 'OWNER'] },
      { href: '/users', label: 'Users', roles: ['OWNER'] },
      { href: '/onboarding', label: 'Setup Guide', roles: ['OWNER'] },
    ],
  },
];

export const SETTINGS_TAB_SECTIONS: SettingsTabSection[] = [
  {
    id: 'core',
    label: 'Business setup',
    items: [
      { href: '/settings', label: 'Business', roles: ['MANAGER', 'OWNER'] },
      { href: '/settings/organization', label: 'Organization', roles: ['MANAGER', 'OWNER'] },
      { href: '/settings/billing', label: 'Billing', roles: ['MANAGER', 'OWNER'] },
      { href: '/settings/online-store', label: 'Online Store', roles: ['MANAGER', 'OWNER'], minimumPlan: 'PRO' },
      { href: '/settings/analytics', label: 'Analytics', roles: ['MANAGER', 'OWNER'], minimumPlan: 'PRO' },
      { href: '/settings/notifications', label: 'Notifications', roles: ['MANAGER', 'OWNER'], minimumPlan: 'GROWTH' },
      { href: '/settings/loyalty', label: 'Loyalty', roles: ['MANAGER', 'OWNER'], minimumPlan: 'GROWTH' },
      { href: '/settings/receipt-design', label: 'Receipt Design', roles: ['MANAGER', 'OWNER'] },
      { href: '/settings/import-stock', label: 'Import Stock', roles: ['MANAGER', 'OWNER'] },
    ],
  },
  {
    id: 'advanced',
    label: 'Owner & recovery',
    items: [
      { href: '/settings/system-health', label: 'System Health', roles: ['MANAGER', 'OWNER'] },
      { href: '/settings/backup', label: 'Backup', roles: ['OWNER'] },
      { href: '/settings/data-repair', label: 'Data Repair', roles: ['OWNER'] },
    ],
  },
];

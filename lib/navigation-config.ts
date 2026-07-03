import type { BusinessPlan, getFeatures } from './features';

export type AppRole = 'CASHIER' | 'MANAGER' | 'OWNER';

export type NavIconKey =
  | 'pos'
  | 'sales'
  | 'orders'
  | 'shifts'
  | 'inventory'
  | 'stockAdjustments'
  | 'stockMovements'
  | 'purchases'
  | 'transfers'
  | 'products'
  | 'labels'
  | 'expenses'
  | 'payments'
  | 'supplierAging'
  | 'reconciliation'
  | 'people'
  | 'customers'
  | 'suppliers'
  | 'reportsHub'
  | 'reports'
  | 'analytics'
  | 'profit'
  | 'supplierSales'
  | 'reorder'
  | 'incomeStatement'
  | 'balanceSheet'
  | 'cashFlow'
  | 'cashDrawer'
  | 'risk'
  | 'audit'
  | 'exports'
  | 'ownerBrief'
  | 'forecast'
  | 'account'
  | 'settings'
  | 'users'
  | 'setup';

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
  iconKey?: NavIconKey;
  description?: string;
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
      { href: '/reports', label: 'Reports Hub', roles: ['MANAGER', 'OWNER'], iconKey: 'reportsHub' },
      { href: '/reports/command-center', label: 'Command Center', roles: ['MANAGER', 'OWNER'], iconKey: 'reports' },
      { href: '/reports/dashboard', label: 'Trading Report', roles: ['MANAGER', 'OWNER'], iconKey: 'analytics' },
      { href: '/reports/weekly-digest', label: 'Weekly Digest', roles: ['MANAGER', 'OWNER'], iconKey: 'reports' },
    ],
  },
  {
    id: 'sales-stock',
    label: 'Sales & Stock',
    items: [
      { href: '/reports/analytics', label: 'Sales Analytics', roles: ['MANAGER', 'OWNER'], iconKey: 'analytics', minimumPlan: 'GROWTH' },
      { href: '/reports/margins', label: 'Profit Margins', roles: ['MANAGER', 'OWNER'], iconKey: 'profit', minimumPlan: 'GROWTH' },
      { href: '/reports/sales-by-supplier', label: 'Sales by Linked Supplier', roles: ['MANAGER', 'OWNER'], iconKey: 'supplierSales', minimumPlan: 'GROWTH' },
      { href: '/reports/reorder-suggestions', label: 'Reorder Suggestions', roles: ['MANAGER', 'OWNER'], iconKey: 'reorder', minimumPlan: 'GROWTH' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      { href: '/reports/income-statement', label: 'Income Statement', roles: ['MANAGER', 'OWNER'], iconKey: 'incomeStatement', minimumPlan: 'GROWTH' },
      { href: '/reports/balance-sheet', label: 'Balance Sheet', roles: ['MANAGER', 'OWNER'], iconKey: 'balanceSheet', minimumPlan: 'GROWTH' },
      { href: '/reports/cashflow', label: 'Cash Flow', roles: ['MANAGER', 'OWNER'], iconKey: 'cashFlow', minimumPlan: 'GROWTH' },
      { href: '/reports/cash-drawer', label: 'Cash Drawer', roles: ['MANAGER', 'OWNER'], iconKey: 'cashDrawer' },
    ],
  },
  {
    id: 'control',
    label: 'Control',
    items: [
      { href: '/reports/risk-monitor', label: 'Risk Monitor', roles: ['MANAGER', 'OWNER'], iconKey: 'risk', minimumPlan: 'GROWTH' },
      { href: '/reports/audit-log', label: 'Audit Log', roles: ['OWNER'], iconKey: 'audit', minimumPlan: 'PRO' },
      { href: '/reports/exports', label: 'Exports', roles: ['MANAGER', 'OWNER'], iconKey: 'exports' },
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    items: [
      { href: '/reports/owner', label: 'Owner Brief', roles: ['OWNER'], iconKey: 'ownerBrief', minimumPlan: 'PRO' },
      { href: '/reports/cashflow-forecast', label: 'Cash Flow Forecast', roles: ['OWNER'], iconKey: 'forecast', minimumPlan: 'PRO' },
    ],
  },
];

export const NAV_GROUPS: NavigationGroup[] = [
  {
    id: 'sell',
    label: 'Sell',
    items: [
      { href: '/pos', label: 'POS', roles: ['CASHIER', 'MANAGER', 'OWNER'], iconKey: 'pos', description: 'Open the sales counter.' },
      { href: '/my-sales', label: 'My Sales', roles: ['CASHIER'], iconKey: 'sales', description: 'View sales you recorded on the till.' },
      { href: '/sales', label: 'Sales', roles: ['MANAGER', 'OWNER'], iconKey: 'sales', description: 'Review transactions and receipts.' },
      { href: '/online-orders', label: 'Online Orders', roles: ['MANAGER', 'OWNER'], iconKey: 'orders', description: 'Manage storefront orders.', requiresFeature: 'onlineStorefront' },
      { href: '/shifts', label: 'Shifts', roles: ['CASHIER', 'MANAGER', 'OWNER'], iconKey: 'shifts', description: 'Start, close, and review cashier shifts.' },
    ],
  },
  {
    id: 'stock',
    label: 'Stock',
    items: [
      { href: '/inventory', label: 'Inventory', roles: ['MANAGER', 'OWNER'], iconKey: 'inventory', description: 'View stock levels and reorder needs.' },
      { href: '/inventory/adjustments', label: 'Stock Adjustments', roles: ['MANAGER', 'OWNER'], iconKey: 'stockAdjustments', description: 'Correct stock counts safely.' },
      { href: '/reports/stock-movements', label: 'Stock Movements', roles: ['MANAGER', 'OWNER'], iconKey: 'stockMovements', description: 'Review stock in and out.' },
      { href: '/purchases', label: 'Purchases', roles: ['MANAGER', 'OWNER'], iconKey: 'purchases', description: 'Receive stock and supplier invoices.' },
      { href: '/transfers', label: 'Transfers', roles: ['MANAGER', 'OWNER'], iconKey: 'transfers', description: 'Move stock between branches.' },
      { href: '/products', label: 'Products', roles: ['CASHIER', 'MANAGER', 'OWNER'], iconKey: 'products', description: 'Manage catalogue, prices, and barcodes.' },
      { href: '/products/labels', label: 'Product Labels', roles: ['CASHIER', 'MANAGER', 'OWNER'], iconKey: 'labels', description: 'Print product and shelf labels.', minimumPlan: 'GROWTH' },
    ],
  },
  {
    id: 'money',
    label: 'Money',
    items: [
      { href: '/expenses', label: 'Expenses', roles: ['MANAGER', 'OWNER'], iconKey: 'expenses', description: 'Track operating costs.' },
      { href: '/payments/customer-receipts', label: 'Customer Receipts', roles: ['MANAGER', 'OWNER'], iconKey: 'payments', description: 'Record money received from customers.' },
      { href: '/payments/supplier-payments', label: 'Supplier Payments', roles: ['MANAGER', 'OWNER'], iconKey: 'payments', description: 'Pay suppliers and clear balances.' },
      { href: '/payments/supplier-aging', label: 'Supplier Aging', roles: ['MANAGER', 'OWNER'], iconKey: 'supplierAging', description: 'See overdue supplier balances.' },
      { href: '/payments/reconciliation', label: 'MoMo Reconciliation', roles: ['MANAGER', 'OWNER'], iconKey: 'reconciliation', description: 'Match mobile money collections.' },
      { href: '/payments/reconciliation/card-transfer', label: 'Card/Transfer Reconciliation', roles: ['MANAGER', 'OWNER'], iconKey: 'reconciliation', description: 'Reconcile bank and card payments.' },
    ],
  },
  {
    id: 'relationships',
    label: 'People',
    items: [
      { href: '/people', label: 'People Hub', roles: ['MANAGER', 'OWNER'], iconKey: 'people', description: 'Open customer and supplier tools.' },
      { href: '/customers', label: 'Customers', roles: ['MANAGER', 'OWNER'], iconKey: 'customers', description: 'Manage customer accounts and balances.' },
      { href: '/suppliers', label: 'Suppliers', roles: ['MANAGER', 'OWNER'], iconKey: 'suppliers', description: 'Manage supplier ledgers and payments.' },
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
      { href: '/account', label: 'My Account', roles: ['CASHIER', 'MANAGER', 'OWNER'], iconKey: 'account', description: 'Manage your profile and security.' },
      { href: '/settings', label: 'Settings', roles: ['MANAGER', 'OWNER'], iconKey: 'settings', description: 'Configure business preferences.' },
      { href: '/users', label: 'Users', roles: ['OWNER'], iconKey: 'users', description: 'Invite and manage staff access.' },
      { href: '/onboarding', label: 'Setup Guide', roles: ['OWNER'], iconKey: 'setup', description: 'Finish setup and readiness tasks.' },
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

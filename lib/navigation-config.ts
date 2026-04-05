export type AppRole = 'CASHIER' | 'MANAGER' | 'OWNER';

export type NavigationItem = {
  href: string;
  label: string;
  roles: AppRole[];
  advanced?: boolean;
};

export type NavigationGroup = {
  id: string;
  label: string;
  items: NavigationItem[];
};

export type SettingsTabSection = {
  id: string;
  label: string;
  items: NavigationItem[];
};

export const NAV_GROUPS: NavigationGroup[] = [
  {
    id: 'sell',
    label: 'Sell',
    items: [
      { href: '/pos', label: 'POS', roles: ['CASHIER', 'MANAGER', 'OWNER'] },
      { href: '/sales', label: 'Sales', roles: ['MANAGER', 'OWNER'] },
      { href: '/shifts', label: 'Shifts', roles: ['CASHIER', 'MANAGER', 'OWNER'] },
    ],
  },
  {
    id: 'stock',
    label: 'Stock',
    items: [
      { href: '/inventory', label: 'Inventory', roles: ['MANAGER', 'OWNER'] },
      { href: '/inventory/adjustments', label: 'Stock Adjustments', roles: ['MANAGER', 'OWNER'] },
      { href: '/purchases', label: 'Purchases', roles: ['MANAGER', 'OWNER'] },
      { href: '/transfers', label: 'Transfers', roles: ['MANAGER', 'OWNER'] },
      { href: '/products', label: 'Products', roles: ['CASHIER', 'MANAGER', 'OWNER'] },
      { href: '/products/labels', label: 'Product Labels', roles: ['CASHIER', 'MANAGER', 'OWNER'] },
    ],
  },
  {
    id: 'money',
    label: 'Money',
    items: [
      { href: '/expenses', label: 'Expenses', roles: ['MANAGER', 'OWNER'] },
      { href: '/payments/customer-receipts', label: 'Customer Receipts', roles: ['MANAGER', 'OWNER'] },
      { href: '/payments/supplier-payments', label: 'Supplier Payments', roles: ['MANAGER', 'OWNER'] },
      { href: '/payments/reconciliation', label: 'MoMo Reconciliation', roles: ['MANAGER', 'OWNER'] },
      { href: '/payments/reconciliation/card-transfer', label: 'Card/Transfer Reconciliation', roles: ['MANAGER', 'OWNER'] },
    ],
  },
  {
    id: 'relationships',
    label: 'Customers & suppliers',
    items: [
      { href: '/customers', label: 'Customers', roles: ['MANAGER', 'OWNER'] },
      { href: '/suppliers', label: 'Suppliers', roles: ['MANAGER', 'OWNER'] },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    items: [
      { href: '/reports/dashboard', label: 'Dashboard', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/analytics', label: 'Analytics', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/margins', label: 'Profit Margins', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/reorder-suggestions', label: 'Reorder Suggestions', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/income-statement', label: 'Income Statement', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/balance-sheet', label: 'Balance Sheet', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/cashflow', label: 'Cashflow', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/exports', label: 'Exports', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/cash-drawer', label: 'Cash Drawer', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/risk-monitor', label: 'Risk Monitor', roles: ['MANAGER', 'OWNER'], advanced: true },
      { href: '/reports/owner', label: 'Owner Intelligence', roles: ['OWNER'], advanced: true },
      { href: '/reports/cashflow-forecast', label: 'Cashflow Forecast', roles: ['OWNER'], advanced: true },
      { href: '/reports/audit-log', label: 'Audit Log', roles: ['OWNER'], advanced: true },
    ],
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
      { href: '/settings/notifications', label: 'Notifications', roles: ['MANAGER', 'OWNER'] },
      { href: '/settings/receipt-design', label: 'Receipt Design', roles: ['MANAGER', 'OWNER'] },
      { href: '/settings/import-stock', label: 'Import Stock', roles: ['MANAGER', 'OWNER'] },
    ],
  },
  {
    id: 'advanced',
    label: 'Recovery & diagnostics',
    items: [
      { href: '/settings/system-health', label: 'System Health', roles: ['MANAGER', 'OWNER'], advanced: true },
      { href: '/settings/backup', label: 'Backup', roles: ['OWNER'], advanced: true },
      { href: '/settings/data-repair', label: 'Data Repair', roles: ['OWNER'], advanced: true },
    ],
  },
];

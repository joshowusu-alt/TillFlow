/**
 * Canonical Instant Loading mapping. A variant is only "route-specific" when
 * CompactRouteLoading (or a dedicated loader) structurally matches the live page.
 */
export const ROUTE_SKELETON_REGISTRY = [
  { route: '/products', variant: 'products', dedicated: false },
  { route: '/products/new', variant: 'products', dedicated: false },
  { route: '/products/[id]', variant: 'product-form', dedicated: false },
  { route: '/purchases', variant: 'purchases', dedicated: false },
  { route: '/purchases/[id]', variant: 'purchase-detail', dedicated: false },
  { route: '/sales', variant: 'sales', dedicated: false },
  { route: '/shifts', variant: 'shifts', dedicated: false },
  { route: '/expenses', variant: 'expenses', dedicated: false },
  { route: '/settings', variant: 'settings', dedicated: false },
  { route: '/people', variant: 'people-hub', dedicated: false },
  { route: '/users', variant: 'people', dedicated: false },
  { route: '/customers', variant: 'list', dedicated: false },
  { route: '/suppliers', variant: 'list', dedicated: false },
  { route: '/payments', variant: 'payments', dedicated: false },
  { route: '/online-orders', variant: 'online-orders', dedicated: false },
  { route: '/reports', variant: 'reports', dedicated: false },
  { route: '/reports/money-received', variant: 'report-detail', dedicated: false },
  { route: '/reports/receipts', variant: 'report-detail', dedicated: false },
  { route: '/reports/cash-drawer', variant: 'report-detail', dedicated: false },
  { route: '/reports/business-movement', variant: 'report-detail', dedicated: false },
  { route: '/reports/momo-confirmation', variant: 'report-detail', dedicated: false },
  { route: '/reports/balance-sheet', variant: 'report-detail', dedicated: false },
  { route: '/reports/cashflow-forecast', variant: 'report-detail', dedicated: false },
  { route: '/reports/command-center', variant: 'command-center', dedicated: true },
  { route: '/reports/owner', variant: 'owner', dedicated: true },
  { route: '/inventory', variant: 'inventory', dedicated: false },
  { route: '/pos', variant: 'pos', dedicated: true },
] as const;

export type RegistrySkeletonVariant = (typeof ROUTE_SKELETON_REGISTRY)[number]['variant'];

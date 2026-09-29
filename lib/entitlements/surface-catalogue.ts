import type { BusinessPlan } from '@/lib/features';
import type {
  ActionPolicy,
  FeatureFlag,
  Role,
  SurfaceAction,
  SurfaceSpec,
} from '@/lib/entitlements/types';

/**
 * E.0 and section C are the only scope and access assignments.
 * `owner_daily_summary_whatsapp_legacy` is intentionally absent.
 * Backup and data repair have no stable IDs in the contract and are not entries.
 */

export const SURFACE_IDS = [
  'reports_hub',
  'command_center',
  'trading_report',
  'money_received',
  'momo_confirmation',
  'business_movement',
  'receipt_transactions',
  'weekly_digest',
  'export_weekly_digest',
  'sales_analytics',
  'profit_margins',
  'export_margins',
  'sales_by_supplier',
  'export_sales_by_supplier',
  'reorder_suggestions',
  'income_statement',
  'balance_sheet',
  'cash_flow_statement',
  'export_financials',
  'cash_drawer_report',
  'export_eod_csv',
  'export_eod_pdf',
  'drawer_drilldown',
  'risk_monitor',
  'export_risk_summary',
  'stock_movements',
  'exports_hub',
  'audit_log',
  'owner_brief',
  'export_owner_brief',
  'cashflow_forecast',
  'supplier_ageing',
  'export_supplier_ageing',
  'customer_statement',
  'supplier_statement',
  'export_sales',
  'export_purchases',
  'export_reversals',
  'export_inventory',
  'export_products',
  'export_money_received',
  'export_momo_confirmation',
  'export_business_movement',
  'export_pack',
  'product_labels',
  'export_labels',
  'storefront_analytics',
  'online_store_settings',
  'notification_settings',
  'owner_daily_summary',
  'sale_detail',
  'legacy_reports_sales_redirect',
  'cron_eod_summary',
  'cron_dispatch_outbox',
  'seed_once',
  'user_admin',
  'billing_settings',
  'account_settings',
  'organization_settings',
  'getting_started',
] as const;

export type SurfaceId = (typeof SURFACE_IDS)[number];

const OM = ['OWNER', 'MANAGER'] as const satisfies readonly Role[];
const OMC = ['OWNER', 'MANAGER', 'CASHIER'] as const satisfies readonly Role[];
const OWNER = ['OWNER'] as const satisfies readonly Role[];
const SYSTEM_ONLY = [] as const satisfies readonly Role[];

/** F.2 Starter sales exports omit these headers. */
export const STARTER_SALES_COLUMN_EXCLUSIONS = ['Cost', 'Margin', 'Margin %', 'Cost of goods'] as const;

function policy(
  roles: readonly Role[],
  restricted: ActionPolicy['RESTRICTED'],
  cancelled: ActionPolicy['CANCELLED'],
): ActionPolicy {
  return { roles, OPEN: 'ALLOW', RESTRICTED: restricted, CANCELLED: cancelled };
}

const viewOm = policy(OM, 'RO', 'DENY');
const viewO = policy(OWNER, 'RO', 'DENY');
const viewOmc = policy(OMC, 'RO', 'DENY');
const exportOm = policy(OM, 'DENY', 'DENY');
const exportO = policy(OWNER, 'DENY', 'DENY');
const exportOmc = policy(OMC, 'DENY', 'DENY');
const sendSystem = policy(SYSTEM_ONLY, 'DENY', 'DENY');
const disableOwner = policy(OWNER, 'ALLOW', 'ALLOW');

type DimOptions = {
  consolidationSupported?: boolean;
  rangeCapped?: boolean;
  auditRequired?: boolean;
  exportColumns?: SurfaceSpec['exportColumns'];
};

function dimensional(
  id: SurfaceId,
  minPlan: BusinessPlan,
  action: 'VIEW' | 'EXPORT',
  roles: 'OM' | 'O' | 'OMC',
  options: DimOptions = {},
): SurfaceSpec {
  const chosen =
    action === 'VIEW'
      ? roles === 'O'
        ? viewO
        : roles === 'OMC'
          ? viewOmc
          : viewOm
      : roles === 'O'
        ? exportO
        : roles === 'OMC'
          ? exportOmc
          : exportOm;
  return {
    id,
    minPlan,
    actions: { [action]: chosen },
    scopeClass: 'STORE_DIMENSIONAL',
    consolidationSupported: options.consolidationSupported ?? true,
    rangeCapped: options.rangeCapped ?? false,
    auditRequired: options.auditRequired,
    exportColumns: options.exportColumns,
  };
}

function plain(
  id: SurfaceId,
  minPlan: BusinessPlan,
  scopeClass: Exclude<SurfaceSpec['scopeClass'], 'STORE_DIMENSIONAL'>,
  actions: Partial<Record<SurfaceAction, ActionPolicy>>,
  options: {
    rangeCapped?: boolean;
    requiresFeature?: FeatureFlag;
    cancelledDestinationMask?: boolean;
    auditRequired?: boolean;
    exportColumns?: SurfaceSpec['exportColumns'];
  } = {},
): SurfaceSpec {
  return {
    id,
    minPlan,
    scopeClass,
    actions,
    rangeCapped: options.rangeCapped ?? false,
    requiresFeature: options.requiresFeature,
    cancelledDestinationMask: options.cancelledDestinationMask,
    auditRequired: options.auditRequired,
    exportColumns: options.exportColumns,
  };
}

const salesColumnPolicy = { starterExcludes: STARTER_SALES_COLUMN_EXCLUSIONS };

export const SURFACE_CATALOGUE: Record<SurfaceId, SurfaceSpec> = {
  reports_hub: plain('reports_hub', 'STARTER', 'NONE', { VIEW: viewOm }),
  command_center: dimensional('command_center', 'STARTER', 'VIEW', 'OM', { rangeCapped: true }),
  trading_report: dimensional('trading_report', 'STARTER', 'VIEW', 'OM'),
  money_received: dimensional('money_received', 'STARTER', 'VIEW', 'OM'),
  momo_confirmation: dimensional('momo_confirmation', 'STARTER', 'VIEW', 'OM'),
  business_movement: dimensional('business_movement', 'STARTER', 'VIEW', 'OM', { rangeCapped: true }),
  receipt_transactions: dimensional('receipt_transactions', 'STARTER', 'VIEW', 'OM'),
  weekly_digest: dimensional('weekly_digest', 'STARTER', 'VIEW', 'OM', { rangeCapped: true }),
  export_weekly_digest: dimensional('export_weekly_digest', 'STARTER', 'EXPORT', 'OM', {
    rangeCapped: true,
    auditRequired: true,
  }),
  sales_analytics: dimensional('sales_analytics', 'GROWTH', 'VIEW', 'OM', { rangeCapped: true }),
  profit_margins: dimensional('profit_margins', 'GROWTH', 'VIEW', 'OM', { rangeCapped: true }),
  export_margins: dimensional('export_margins', 'GROWTH', 'EXPORT', 'OM', {
    rangeCapped: true,
    auditRequired: true,
  }),
  sales_by_supplier: dimensional('sales_by_supplier', 'GROWTH', 'VIEW', 'OM', { rangeCapped: true }),
  export_sales_by_supplier: dimensional('export_sales_by_supplier', 'GROWTH', 'EXPORT', 'OM', {
    rangeCapped: true,
    auditRequired: true,
  }),
  reorder_suggestions: dimensional('reorder_suggestions', 'GROWTH', 'VIEW', 'OM'),
  income_statement: plain('income_statement', 'GROWTH', 'ACCOUNTING_WHOLE_BUSINESS', { VIEW: viewOm }, {
    rangeCapped: true,
  }),
  balance_sheet: plain('balance_sheet', 'GROWTH', 'ACCOUNTING_WHOLE_BUSINESS', { VIEW: viewOm }, {
    rangeCapped: true,
  }),
  cash_flow_statement: plain('cash_flow_statement', 'GROWTH', 'ACCOUNTING_WHOLE_BUSINESS', { VIEW: viewOm }, {
    rangeCapped: true,
  }),
  export_financials: plain('export_financials', 'GROWTH', 'ACCOUNTING_WHOLE_BUSINESS', { EXPORT: exportOm }, {
    rangeCapped: true,
    auditRequired: true,
  }),
  cash_drawer_report: dimensional('cash_drawer_report', 'STARTER', 'VIEW', 'OM'),
  export_eod_csv: dimensional('export_eod_csv', 'STARTER', 'EXPORT', 'OM', { auditRequired: true }),
  export_eod_pdf: dimensional('export_eod_pdf', 'STARTER', 'EXPORT', 'OM', { auditRequired: true }),
  drawer_drilldown: dimensional('drawer_drilldown', 'STARTER', 'VIEW', 'OMC', {
    consolidationSupported: false,
  }),
  risk_monitor: dimensional('risk_monitor', 'GROWTH', 'VIEW', 'OM', { rangeCapped: true }),
  export_risk_summary: dimensional('export_risk_summary', 'GROWTH', 'EXPORT', 'OM', {
    rangeCapped: true,
    auditRequired: true,
  }),
  stock_movements: dimensional('stock_movements', 'STARTER', 'VIEW', 'OM', { rangeCapped: true }),
  exports_hub: plain('exports_hub', 'STARTER', 'NONE', { VIEW: viewOm }),
  audit_log: plain('audit_log', 'PRO', 'TENANT_ADMIN', { VIEW: viewO }),
  owner_brief: plain('owner_brief', 'PRO', 'FIXED_CONSOLIDATED', { VIEW: viewO }),
  export_owner_brief: plain('export_owner_brief', 'PRO', 'FIXED_CONSOLIDATED', { EXPORT: exportO }, {
    auditRequired: true,
  }),
  cashflow_forecast: plain('cashflow_forecast', 'PRO', 'FIXED_CONSOLIDATED', { VIEW: viewO }),
  supplier_ageing: dimensional('supplier_ageing', 'STARTER', 'VIEW', 'OM'),
  export_supplier_ageing: dimensional('export_supplier_ageing', 'STARTER', 'EXPORT', 'OM', {
    auditRequired: true,
  }),
  customer_statement: dimensional('customer_statement', 'STARTER', 'EXPORT', 'OM', { auditRequired: true }),
  supplier_statement: dimensional('supplier_statement', 'STARTER', 'EXPORT', 'OM', { auditRequired: true }),
  export_sales: dimensional('export_sales', 'STARTER', 'EXPORT', 'OM', {
    auditRequired: true,
    exportColumns: salesColumnPolicy,
  }),
  export_purchases: dimensional('export_purchases', 'STARTER', 'EXPORT', 'OM', { auditRequired: true }),
  export_reversals: dimensional('export_reversals', 'STARTER', 'EXPORT', 'OM', { auditRequired: true }),
  export_inventory: dimensional('export_inventory', 'STARTER', 'EXPORT', 'OM', { auditRequired: true }),
  export_products: plain('export_products', 'STARTER', 'TENANT_CATALOG', { EXPORT: exportOm }, {
    auditRequired: true,
  }),
  export_money_received: dimensional('export_money_received', 'STARTER', 'EXPORT', 'OM', { auditRequired: true }),
  export_momo_confirmation: dimensional('export_momo_confirmation', 'STARTER', 'EXPORT', 'OM', {
    auditRequired: true,
  }),
  export_business_movement: dimensional('export_business_movement', 'STARTER', 'EXPORT', 'OM', {
    rangeCapped: true,
    auditRequired: true,
  }),
  export_pack: plain(
    'export_pack',
    'STARTER',
    'PER_MEMBER',
    { VIEW: viewOm, EXPORT: exportOm },
    { auditRequired: true, exportColumns: salesColumnPolicy },
  ),
  product_labels: plain('product_labels', 'GROWTH', 'NONE', { VIEW: viewOmc }),
  export_labels: plain('export_labels', 'GROWTH', 'NONE', { EXPORT: exportOmc }, { auditRequired: true }),
  storefront_analytics: plain(
    'storefront_analytics',
    'GROWTH',
    'STOREFRONT_DOMAIN',
    { VIEW: viewOm },
    { rangeCapped: true, requiresFeature: 'onlineStorefront' },
  ),
  online_store_settings: plain(
    'online_store_settings',
    'GROWTH',
    'NONE',
    { VIEW: viewOm },
    { requiresFeature: 'onlineStorefront' },
  ),
  notification_settings: plain(
    'notification_settings',
    'GROWTH',
    'NONE',
    {
      VIEW: policy(OWNER, 'ALLOW', 'ALLOW'),
      CONFIGURE_DELIVERY: policy(OWNER, 'DENY', 'DENY'),
      DISABLE_DELIVERY: disableOwner,
      PREVIEW_DELIVERY: policy(OWNER, 'DENY', 'DENY'),
      SEND_DELIVERY: policy(OWNER, 'DENY', 'DENY'),
    },
    { cancelledDestinationMask: true },
  ),
  owner_daily_summary: {
    id: 'owner_daily_summary',
    minPlan: 'GROWTH',
    scopeClass: 'STORE_DIMENSIONAL',
    consolidationSupported: true,
    rangeCapped: false,
    actions: {
      SEND_DELIVERY: sendSystem,
      DISABLE_DELIVERY: disableOwner,
    },
  },
  sale_detail: plain('sale_detail', 'STARTER', 'TENANT_RECORD', { VIEW: viewOmc }),
  legacy_reports_sales_redirect: plain('legacy_reports_sales_redirect', 'STARTER', 'NONE', { VIEW: viewOm }),
  cron_eod_summary: {
    id: 'cron_eod_summary',
    minPlan: 'GROWTH',
    scopeClass: 'STORE_DIMENSIONAL',
    consolidationSupported: true,
    rangeCapped: false,
    actions: { SEND_DELIVERY: sendSystem },
  },
  cron_dispatch_outbox: {
    id: 'cron_dispatch_outbox',
    minPlan: 'GROWTH',
    scopeClass: 'STORE_DIMENSIONAL',
    consolidationSupported: true,
    rangeCapped: false,
    actions: { SEND_DELIVERY: sendSystem },
  },
  seed_once: plain('seed_once', 'STARTER', 'NONE', {}),
  user_admin: plain('user_admin', 'STARTER', 'NONE', { VIEW: viewO }),
  billing_settings: plain('billing_settings', 'STARTER', 'NONE', {
    VIEW: policy(OM, 'ALLOW', 'ALLOW'),
  }),
  account_settings: plain('account_settings', 'STARTER', 'NONE', {
    VIEW: policy(OMC, 'ALLOW', 'ALLOW'),
  }),
  organization_settings: plain('organization_settings', 'STARTER', 'NONE', {
    VIEW: policy(OM, 'ALLOW', 'ALLOW'),
  }),
  getting_started: plain('getting_started', 'STARTER', 'NONE', {
    VIEW: policy(OMC, 'ALLOW', 'ALLOW'),
  }),
};

function assertCatalogueIntegrity(): void {
  const keys = Object.keys(SURFACE_CATALOGUE);
  if (keys.length !== SURFACE_IDS.length) {
    throw new Error('Surface catalogue size does not match SURFACE_IDS');
  }
  for (const id of SURFACE_IDS) {
    const spec = SURFACE_CATALOGUE[id];
    if (spec.id !== id) {
      throw new Error(`Catalogue key ${id} does not match spec.id ${spec.id}`);
    }
    if (spec.scopeClass === 'STORE_DIMENSIONAL' && typeof spec.consolidationSupported !== 'boolean') {
      throw new Error(`${id} is missing consolidationSupported`);
    }
  }
}

assertCatalogueIntegrity();

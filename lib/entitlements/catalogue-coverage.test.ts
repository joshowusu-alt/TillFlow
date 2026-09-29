import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SURFACE_CATALOGUE, SURFACE_IDS, type SurfaceId } from '@/lib/entitlements/surface-catalogue';
import { STARTER_SALES_COLUMN_EXCLUSIONS } from '@/lib/entitlements/surface-catalogue';
import { FEATURE_FLAGS, ROLES, SCOPE_CLASSES, SURFACE_ACTIONS } from '@/lib/entitlements/types';
import type { Role, SurfaceAction } from '@/lib/entitlements/types';

/**
 * Executable mapping of contract sections C and E.0 onto the catalogue.
 * This is the test oracle. Runtime code has one catalogue.
 */

const ROLE_SETS: Record<string, readonly Role[]> = {
  OM: ['OWNER', 'MANAGER'],
  OMC: ['OWNER', 'MANAGER', 'CASHIER'],
  O: ['OWNER'],
  SYS: [],
};

const CONTRACT_ROWS = `
reports_hub STARTER NONE - false VIEW:OM:RO:DENY
command_center STARTER STORE_DIMENSIONAL yes true VIEW:OM:RO:DENY
trading_report STARTER STORE_DIMENSIONAL yes false VIEW:OM:RO:DENY
money_received STARTER STORE_DIMENSIONAL yes false VIEW:OM:RO:DENY
momo_confirmation STARTER STORE_DIMENSIONAL yes false VIEW:OM:RO:DENY
business_movement STARTER STORE_DIMENSIONAL yes true VIEW:OM:RO:DENY
receipt_transactions STARTER STORE_DIMENSIONAL yes false VIEW:OM:RO:DENY
weekly_digest STARTER STORE_DIMENSIONAL yes true VIEW:OM:RO:DENY
export_weekly_digest STARTER STORE_DIMENSIONAL yes true EXPORT:OM:DENY:DENY audit
sales_analytics GROWTH STORE_DIMENSIONAL yes true VIEW:OM:RO:DENY
profit_margins GROWTH STORE_DIMENSIONAL yes true VIEW:OM:RO:DENY
export_margins GROWTH STORE_DIMENSIONAL yes true EXPORT:OM:DENY:DENY audit
sales_by_supplier GROWTH STORE_DIMENSIONAL yes true VIEW:OM:RO:DENY
export_sales_by_supplier GROWTH STORE_DIMENSIONAL yes true EXPORT:OM:DENY:DENY audit
reorder_suggestions GROWTH STORE_DIMENSIONAL yes false VIEW:OM:RO:DENY
income_statement GROWTH ACCOUNTING_WHOLE_BUSINESS - true VIEW:OM:RO:DENY
balance_sheet GROWTH ACCOUNTING_WHOLE_BUSINESS - true VIEW:OM:RO:DENY
cash_flow_statement GROWTH ACCOUNTING_WHOLE_BUSINESS - true VIEW:OM:RO:DENY
export_financials GROWTH ACCOUNTING_WHOLE_BUSINESS - true EXPORT:OM:DENY:DENY audit
cash_drawer_report STARTER STORE_DIMENSIONAL yes false VIEW:OM:RO:DENY
export_eod_csv STARTER STORE_DIMENSIONAL yes false EXPORT:OM:DENY:DENY audit
export_eod_pdf STARTER STORE_DIMENSIONAL yes false EXPORT:OM:DENY:DENY audit
drawer_drilldown STARTER STORE_DIMENSIONAL no false VIEW:OMC:RO:DENY
risk_monitor GROWTH STORE_DIMENSIONAL yes true VIEW:OM:RO:DENY
export_risk_summary GROWTH STORE_DIMENSIONAL yes true EXPORT:OM:DENY:DENY audit
stock_movements STARTER STORE_DIMENSIONAL yes true VIEW:OM:RO:DENY
exports_hub STARTER NONE - false VIEW:OM:RO:DENY
audit_log PRO TENANT_ADMIN - false VIEW:O:RO:DENY
owner_brief PRO FIXED_CONSOLIDATED - false VIEW:O:RO:DENY
export_owner_brief PRO FIXED_CONSOLIDATED - false EXPORT:O:DENY:DENY audit
cashflow_forecast PRO FIXED_CONSOLIDATED - false VIEW:O:RO:DENY
supplier_ageing STARTER STORE_DIMENSIONAL yes false VIEW:OM:RO:DENY
export_supplier_ageing STARTER STORE_DIMENSIONAL yes false EXPORT:OM:DENY:DENY audit
customer_statement STARTER STORE_DIMENSIONAL yes false EXPORT:OM:DENY:DENY audit
supplier_statement STARTER STORE_DIMENSIONAL yes false EXPORT:OM:DENY:DENY audit
export_sales STARTER STORE_DIMENSIONAL yes false EXPORT:OM:DENY:DENY audit exclude
export_purchases STARTER STORE_DIMENSIONAL yes false EXPORT:OM:DENY:DENY audit
export_reversals STARTER STORE_DIMENSIONAL yes false EXPORT:OM:DENY:DENY audit
export_inventory STARTER STORE_DIMENSIONAL yes false EXPORT:OM:DENY:DENY audit
export_products STARTER TENANT_CATALOG - false EXPORT:OM:DENY:DENY audit
export_money_received STARTER STORE_DIMENSIONAL yes false EXPORT:OM:DENY:DENY audit
export_momo_confirmation STARTER STORE_DIMENSIONAL yes false EXPORT:OM:DENY:DENY audit
export_business_movement STARTER STORE_DIMENSIONAL yes true EXPORT:OM:DENY:DENY audit
export_pack STARTER PER_MEMBER - false VIEW:OM:RO:DENY+EXPORT:OM:DENY:DENY audit exclude
product_labels GROWTH NONE - false VIEW:OMC:RO:DENY
export_labels GROWTH NONE - false EXPORT:OMC:DENY:DENY audit
storefront_analytics GROWTH STOREFRONT_DOMAIN - true VIEW:OM:RO:DENY feature=onlineStorefront
online_store_settings GROWTH NONE - false VIEW:OM:RO:DENY feature=onlineStorefront
notification_settings GROWTH NONE - false VIEW:O:ALLOW:ALLOW+CONFIGURE_DELIVERY:O:DENY:DENY+DISABLE_DELIVERY:O:ALLOW:ALLOW+PREVIEW_DELIVERY:O:DENY:DENY+SEND_DELIVERY:O:DENY:DENY mask
owner_daily_summary GROWTH STORE_DIMENSIONAL yes false SEND_DELIVERY:SYS:DENY:DENY+DISABLE_DELIVERY:O:ALLOW:ALLOW
sale_detail STARTER TENANT_RECORD - false VIEW:OMC:RO:DENY
legacy_reports_sales_redirect STARTER NONE - false VIEW:OM:RO:DENY
cron_eod_summary GROWTH STORE_DIMENSIONAL yes false SEND_DELIVERY:SYS:DENY:DENY
cron_dispatch_outbox GROWTH STORE_DIMENSIONAL yes false SEND_DELIVERY:SYS:DENY:DENY
seed_once STARTER NONE - false -
user_admin STARTER NONE - false VIEW:O:RO:DENY
billing_settings STARTER NONE - false VIEW:OM:ALLOW:ALLOW
account_settings STARTER NONE - false VIEW:OMC:ALLOW:ALLOW
organization_settings STARTER NONE - false VIEW:OM:ALLOW:ALLOW
getting_started STARTER NONE - false VIEW:OMC:ALLOW:ALLOW
`.trim().split(/\r?\n/);

describe('surface catalogue contract', () => {
  it('matches the contract matrix and E.0 for every stable id', () => {
    expect(CONTRACT_ROWS).toHaveLength(SURFACE_IDS.length);
    const seen = new Set<string>();

    for (const row of CONTRACT_ROWS) {
      const [id, minPlan, scopeClass, consolidation, rangeCapped, actions, ...flags] = row.split(/\s+/);
      seen.add(id);
      const spec = SURFACE_CATALOGUE[id as SurfaceId];
      expect(spec, id).toBeTruthy();
      expect(spec.id).toBe(id);
      expect(spec.minPlan).toBe(minPlan);
      expect(spec.scopeClass).toBe(scopeClass);
      expect(spec.rangeCapped).toBe(rangeCapped === 'true');
      if (scopeClass === 'STORE_DIMENSIONAL') {
        expect(spec.scopeClass).toBe('STORE_DIMENSIONAL');
        if (spec.scopeClass === 'STORE_DIMENSIONAL') {
          expect(spec.consolidationSupported).toBe(consolidation === 'yes');
        }
      } else {
        expect(spec).not.toHaveProperty('consolidationSupported');
      }

      if (actions === '-') {
        expect(spec.actions).toEqual({});
      } else {
        const expectedActions = actions.split('+');
        expect(Object.keys(spec.actions).sort()).toEqual(expectedActions.map((item) => item.split(':')[0]).sort());
        for (const encoded of expectedActions) {
          const [action, roleCode, restricted, cancelled] = encoded.split(':');
          const policy = spec.actions[action as SurfaceAction];
          expect(policy, `${id}.${action}`).toBeTruthy();
          expect(policy?.OPEN).toBe('ALLOW');
          expect([...(policy?.roles ?? [])]).toEqual([...(ROLE_SETS[roleCode] ?? ['missing'])]);
          expect(policy?.RESTRICTED).toBe(restricted);
          expect(policy?.CANCELLED).toBe(cancelled);
        }
      }

      expect(Boolean(spec.auditRequired)).toBe(flags.includes('audit'));
      expect(Boolean(spec.cancelledDestinationMask)).toBe(flags.includes('mask'));
      const feature = flags.find((flag) => flag.startsWith('feature='));
      expect(spec.requiresFeature).toBe(feature ? feature.slice('feature='.length) : undefined);
      if (flags.includes('exclude')) {
        expect([...(spec.exportColumns?.starterExcludes ?? [])]).toEqual([...STARTER_SALES_COLUMN_EXCLUSIONS]);
      } else {
        expect(spec.exportColumns).toBeUndefined();
      }
    }

    expect([...seen].sort()).toEqual([...SURFACE_IDS].sort());
  });

  it('keeps weekly digest store-dimensional and leaves the legacy WhatsApp id unknown', () => {
    expect(SURFACE_CATALOGUE.weekly_digest.scopeClass).toBe('STORE_DIMENSIONAL');
    expect(SURFACE_CATALOGUE.export_weekly_digest.scopeClass).toBe('STORE_DIMENSIONAL');
    expect(SURFACE_IDS).not.toContain('owner_daily_summary_whatsapp_legacy' as SurfaceId);
  });

  it('uses only canonical actions, roles, plans, features and scope classes', () => {
    for (const spec of Object.values(SURFACE_CATALOGUE)) {
      expect(['STARTER', 'GROWTH', 'PRO']).toContain(spec.minPlan);
      expect(SCOPE_CLASSES).toContain(spec.scopeClass);
      if (spec.requiresFeature) expect(FEATURE_FLAGS).toContain(spec.requiresFeature);
      for (const [action, policy] of Object.entries(spec.actions)) {
        expect(SURFACE_ACTIONS).toContain(action);
        expect(action).not.toBe('OPERATIONAL_WRITE');
        for (const role of policy?.roles ?? []) expect(ROLES).toContain(role);
      }
    }
  });

  it('is imported only by Stage 2 report consumers, and core files do not import the SMS provider', () => {
    const roots = ['app', 'components', 'hooks', 'lib'].map((dir) => path.join(process.cwd(), dir));
    const files: string[] = [];
    for (const root of roots) walk(root, files);
    const allowed = new Set([
      'app/(protected)/layout.tsx',
      'app/(protected)/payments/supplier-aging/page.tsx',
      'app/(protected)/reports/analytics/page.tsx',
      'app/(protected)/reports/audit-log/page.tsx',
      'app/(protected)/reports/balance-sheet/page.tsx',
      'app/(protected)/reports/business-movement/page.tsx',
      'app/(protected)/reports/cash-drawer/page.tsx',
      'app/(protected)/reports/cashflow/page.tsx',
      'app/(protected)/reports/cashflow-forecast/page.tsx',
      'app/(protected)/reports/command-center/page.tsx',
      'app/(protected)/reports/dashboard/page.tsx',
      'app/(protected)/reports/exports/page.tsx',
      'app/(protected)/reports/income-statement/page.tsx',
      'app/(protected)/reports/margins/page.tsx',
      'app/(protected)/reports/momo-confirmation/page.tsx',
      'app/(protected)/reports/money-received/page.tsx',
      'app/(protected)/reports/owner/page.tsx',
      'app/(protected)/reports/page.tsx',
      'app/(protected)/reports/receipts/page.tsx',
      'app/(protected)/reports/reorder-suggestions/page.tsx',
      'app/(protected)/reports/risk-monitor/page.tsx',
      'app/(protected)/reports/sales/page.tsx',
      'app/(protected)/reports/sales-by-supplier/page.tsx',
      'app/(protected)/reports/stock-movements/page.tsx',
      'app/(protected)/reports/weekly-digest/page.tsx',
      'app/(protected)/reports/layout.tsx',
      'app/(protected)/settings/analytics/page.tsx',
      'app/(protected)/settings/online-store/analytics/page.tsx',
      'app/api/reports/financials/route.ts',
      'app/api/reports/weekly-digest/route.ts',
      'components/TopNav.tsx',
      'components/reports/ReportSurfaceDenial.tsx',
    ]);
    const callers = files.filter((file) => {
      const normalised = file.replace(/\\/g, '/');
      if (normalised.includes('/lib/entitlements/')) return false;
      const source = readFileSync(file, 'utf8');
      return source.includes('lib/entitlements') || source.includes('decideSurfaceAccess') || source.includes('decideBusinessCapability');
    });
    const unexpected = callers
      .map((file) => file.replace(/\\/g, '/').split('/lib/entitlements/')[0])
      .map((file) => {
        const marker = file.includes('/app/') ? file.slice(file.indexOf('app/')) : file.includes('/components/') ? file.slice(file.indexOf('components/')) : file;
        return marker;
      })
      .filter((file) => !allowed.has(file));
    expect(unexpected).toEqual([]);

    const entitlementFiles = files.filter((file) => {
      const normalised = file.replace(/\\/g, '/');
      return normalised.includes('/lib/entitlements/') && !normalised.endsWith('.test.ts') && !normalised.endsWith('live-report.tsx');
    });
    expect(entitlementFiles.length).toBeGreaterThan(0);
    for (const file of entitlementFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/from ['"][^'"]*storefront-sms/);
      expect(source, file).not.toMatch(/from ['"]@prisma\/client['"]/);
      expect(source, file).not.toMatch(/from ['"]@\/lib\/prisma['"]/);
    }
    const adapter = readFileSync(path.join(process.cwd(), 'lib/entitlements/live-report.tsx'), 'utf8');
    expect(adapter).not.toMatch(/from ['"][^'"]*storefront-sms/);
  });
});

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'tmp') continue;
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
}

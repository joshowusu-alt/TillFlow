import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8');

const receivableSurfaces = [
  'app/(protected)/customers/[id]/page.tsx',
  'app/(protected)/customers/[id]/statement/route.ts',
  'app/(protected)/payments/customer-receipts/page.tsx',
  'lib/services/customers.ts',
  'lib/reports/today-kpis.ts',
  'lib/reports/owner-dashboard.ts',
  'app/(protected)/reports/dashboard/TradingDashboardContent.tsx',
];

const payableSurfaces = [
  'app/(protected)/suppliers/[id]/page.tsx',
  'app/(protected)/suppliers/page.tsx',
  'app/(protected)/suppliers/[id]/statement/route.ts',
  'app/(protected)/payments/supplier-payments/page.tsx',
  'lib/services/suppliers.ts',
  'lib/services/supplier-aging.ts',
  'lib/services/supplier-kpis.ts',
  'lib/reports/today-kpis.ts',
  'lib/reports/owner-dashboard.ts',
  'app/(protected)/reports/dashboard/TradingDashboardContent.tsx',
];

describe('A12 live balances use the canonical helpers', () => {
  it('receivable surfaces do not call the status-blind helper', () => {
    for (const file of receivableSurfaces) {
      const source = read(file);
      expect(source, file).toContain('receivableDocumentBalance');
      expect(source, file).not.toContain('computeOutstandingBalance');
    }
  });

  it('payable surfaces do not call the status-blind helper', () => {
    for (const file of payableSurfaces) {
      const source = read(file);
      expect(source, file).toContain('payableDocumentBalance');
      expect(source, file).not.toContain('computeOutstandingBalance');
    }
  });

  it('accounting no longer exports a competing outstanding-balance answer', () => {
    const accounting = read('lib/accounting.ts');
    const operational = read('lib/reports/operational-metrics.ts');
    expect(accounting).not.toContain('export function computeOutstandingBalance');
    expect(operational).not.toContain('export function computeOutstandingBalance');
  });
});

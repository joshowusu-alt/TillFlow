import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveReportDateRange } from '@/lib/reports/date-parsing';

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

const exclusiveEndCallers = [
  'app/(protected)/reports/cash-drawer/page.tsx',
  'lib/reports/margin-analysis.ts',
  'app/(protected)/exports/sales/route.ts',
  'app/(protected)/exports/purchases/route.ts',
  'app/(protected)/exports/reversals/route.ts',
  'app/(protected)/exports/risk-summary/route.ts',
  'app/(protected)/reports/risk-monitor/page.tsx',
  'app/(protected)/reports/stock-movements/page.tsx',
  'app/(protected)/exports/eod-csv/route.ts',
  'app/(protected)/exports/eod-pdf/route.ts',
  'app/(protected)/settings/data-repair/sale-cost-corrections/page.tsx',
];

describe('A7 exclusive ends are queried with lt', () => {
  it('includes the start instant and excludes the end instant', () => {
    const range = resolveReportDateRange(
      { from: '2026-03-15', to: '2026-03-15' },
      new Date('2026-03-01T00:00:00.000Z'),
      new Date('2026-03-20T12:00:00.000Z'),
      'Africa/Accra',
    );
    expect(range.start.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-03-16T00:00:00.000Z');
  });

  it('does not pair an exclusive end with lte', () => {
    for (const file of exclusiveEndCallers) {
      const source = read(file);
      expect(source, file).not.toMatch(/lte:\s*(to|end|from|dateRange\.end)\b/);
      expect(source, file).toMatch(/lt:\s*(to|end|endExclusive|dateRange\.end)\b/);
    }
  });

  it('builds the weekly digest week in the business timezone', () => {
    const page = read('app/(protected)/reports/weekly-digest/page.tsx');
    const route = read('app/api/reports/weekly-digest/route.ts');
    for (const source of [page, route]) {
      expect(source).not.toContain('setHours(');
      expect(source).not.toContain('setDate(');
      expect(source).toContain('businessWeekWindow');
    }
  });
});

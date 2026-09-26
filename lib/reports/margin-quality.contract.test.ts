import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateMarginSet } from './margin-line';

describe('margin quality', () => {
  it('publishes recognised sales and no GP total when a line cost is ambiguous', () => {
    const result = evaluateMarginSet([
      {
        paymentStatus: 'PAID',
        discountPence: 0,
        lines: [
          {
            lineSubtotalPence: 10_000,
            lineDiscountPence: 0,
            promoDiscountPence: 0,
            lineCostPence: 4_000,
            qtyBase: 1,
          },
          {
            lineSubtotalPence: 5_000,
            lineDiscountPence: 0,
            promoDiscountPence: 0,
            lineCostPence: 0,
            qtyBase: 1,
            defaultCostBasePence: 2_000,
          },
        ],
      },
    ]);

    expect(result.state).toBe('INCOMPLETE_COSTS');
    expect(result.recognisedSalesPence).toBe(15_000);
    expect(result.incompleteLineCount).toBe(1);
    expect(result.grossProfitPence).toBeNull();
    expect(result.grossProfitPercent).toBeNull();
  });

  it('does not read stored SalesInvoice.grossMarginPence or the old >0 cost fallback', () => {
    const files = [
      'app/(protected)/reports/dashboard/TradingDashboardContent.tsx',
      'app/(protected)/reports/command-center/page.tsx',
      'lib/reports/weekly-digest.ts',
      'lib/reports/financials.ts',
      'lib/reports/today-kpis.ts',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source, file).not.toContain('grossMarginPence: true');
      expect(source, file).not.toContain('lineCostPence > 0');
      expect(source, file).not.toContain('lineCostPence: { gt: 0 }');
    }
    for (const file of ['lib/reports/weekly-digest.ts', 'lib/reports/financials.ts', 'lib/reports/today-kpis.ts', 'lib/reports/trading-margin.ts']) {
      expect(readFileSync(resolve(process.cwd(), file), 'utf8'), file).toContain('evaluateMarginSet');
    }
    expect(readFileSync(resolve(process.cwd(), 'app/(protected)/reports/dashboard/TradingDashboardContent.tsx'), 'utf8')).toContain('loadTradingPeriodMargin');
    const command = readFileSync(resolve(process.cwd(), 'app/(protected)/reports/command-center/page.tsx'), 'utf8');
    expect(command).toContain("marginState === 'READY'");
  });
});

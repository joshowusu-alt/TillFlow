import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateMarginSet } from './margin-line';

describe('weekly digest margin', () => {
  it('does not divide default cost by 100', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/reports/weekly-digest.ts'), 'utf8');
    expect(source).not.toContain('/ 100');
    expect(source).not.toContain('estCost');
    expect(source).toContain('evaluateMarginSet');
  });

  it('omits a GP total when the week is INCOMPLETE_COSTS', () => {
    const result = evaluateMarginSet([
      {
        paymentStatus: 'PAID',
        discountPence: 0,
        lines: [
          {
            lineSubtotalPence: 8_000,
            lineDiscountPence: 0,
            promoDiscountPence: 0,
            lineCostPence: 0,
            qtyBase: 2,
            defaultCostBasePence: 100,
          },
        ],
      },
    ]);
    expect(result.state).toBe('INCOMPLETE_COSTS');
    expect(result.grossProfitPence).toBeNull();
    expect(result.recognisedSalesPence).toBe(8_000);
  });
});

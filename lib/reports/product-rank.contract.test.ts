import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { productRankRevenuePence, PRODUCT_RANK_REVENUE_FIELD } from './product-rank';

const fixture = {
  lineSubtotalPence: 12_500,
  lineDiscountPence: 500,
  promoDiscountPence: 250,
  lineTotalPence: 13_000,
};

describe('product rank revenue', () => {
  it('uses the sales_activity line net before tax, not line total or raw subtotal', () => {
    expect(PRODUCT_RANK_REVENUE_FIELD).toBe('lineSubtotalPence - lineDiscountPence - promoDiscountPence');
    expect(productRankRevenuePence(fixture)).toBe(11_750);
    expect(productRankRevenuePence(fixture)).not.toBe(fixture.lineTotalPence);
    expect(productRankRevenuePence(fixture)).not.toBe(fixture.lineSubtotalPence);
  });

  it('ranks the same fixture identically for every Wave A product-rank caller', () => {
    const callers = [
      'lib/reports/business-movement/query.ts',
      'app/(protected)/reports/analytics/AnalyticsContent.tsx',
      'lib/reports/supplier-sales.ts',
      'lib/reports/weekly-digest.ts',
    ];
    const revenue = productRankRevenuePence(fixture);
    for (const file of callers) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source, file).toContain('productRankRevenuePence');
      expect(source, file).not.toContain('line.lineTotalPence');
      expect(source, file).not.toContain('lineTotalPence: true');
    }
    expect(revenue).toBe(11_750);
  });
});

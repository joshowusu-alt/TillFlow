import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rankRecognisedProductSales } from './product-rank';

const invoice = {
  paymentStatus: 'PAID',
  discountPence: 0,
  vatPence: 1_250,
  totalPence: 13_000,
  lines: [
    {
      productId: 'sku',
      lineSubtotalPence: 12_500,
      lineDiscountPence: 500,
      promoDiscountPence: 250,
      lineVatPence: 1_250,
      lineTotalPence: 13_000,
    },
  ],
};

describe('product rank revenue', () => {
  it('reconciles ranked line amounts to the recognised invoice total', () => {
    const ranked = rankRecognisedProductSales(invoice);
    expect(ranked.ok).toBe(true);
    expect(ranked.lines.reduce((sum, row) => sum + row.amountPence, 0)).toBe(invoice.totalPence);
    expect(ranked.lines[0]?.amountPence).toBe(13_000);
  });

  it('ranks the same reconciling function for every Wave A product-rank caller', () => {
    const callers = [
      'lib/reports/business-movement/query.ts',
      'app/(protected)/reports/analytics/AnalyticsContent.tsx',
      'lib/reports/supplier-sales.ts',
      'lib/reports/weekly-digest.ts',
    ];
    for (const file of callers) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source, file).toContain('rankRecognisedProductSales');
    }
  });
});

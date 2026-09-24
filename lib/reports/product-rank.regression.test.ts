import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import * as productRank from '@/lib/reports/product-rank';

type RankLine = {
  productId: string;
  lineSubtotalPence: number;
  lineDiscountPence: number;
  promoDiscountPence: number;
  lineVatPence: number;
  lineNhilComponentPence: number;
  lineGetFundComponentPence: number;
  lineVatComponentPence: number;
  lineTotalPence: number;
};

type RankInvoice = {
  paymentStatus: string;
  discountPence: number;
  vatPence: number;
  nhilComponentPence: number;
  getFundComponentPence: number;
  totalPence: number;
  lines: RankLine[];
};

function line(partial: Partial<RankLine> & Pick<RankLine, 'productId' | 'lineSubtotalPence' | 'lineTotalPence'>): RankLine {
  return {
    lineDiscountPence: 0,
    promoDiscountPence: 0,
    lineVatPence: 0,
    lineNhilComponentPence: 0,
    lineGetFundComponentPence: 0,
    lineVatComponentPence: 0,
    ...partial,
  };
}

const ordinary: RankInvoice = {
  paymentStatus: 'PAID',
  discountPence: 0,
  vatPence: 1_500,
  nhilComponentPence: 0,
  getFundComponentPence: 0,
  totalPence: 11_500,
  lines: [
    line({ productId: 'a', lineSubtotalPence: 6_000, lineVatPence: 900, lineTotalPence: 6_900 }),
    line({ productId: 'b', lineSubtotalPence: 4_000, lineVatPence: 600, lineTotalPence: 4_600 }),
  ],
};

function rank(invoice: RankInvoice) {
  const fn = (productRank as { rankRecognisedProductSales?: (invoice: RankInvoice) => {
    ok: boolean;
    differencePence: number;
    lines: Array<{ productId: string; amountPence: number }>;
  } }).rankRecognisedProductSales;
  expect(typeof fn).toBe('function');
  return fn!(invoice);
}

describe('A4 product rank reconciles to recognised invoice total', () => {
  it('ordinary multi-line invoice sums to totalPence', () => {
    const result = rank(ordinary);
    expect(result.ok).toBe(true);
    expect(result.differencePence).toBe(0);
    expect(result.lines.reduce((sum, row) => sum + row.amountPence, 0)).toBe(ordinary.totalPence);
  });

  it('keeps line discount, promo discount, VAT and levies inside the ranked amount', () => {
    const invoice: RankInvoice = {
      paymentStatus: 'PAID',
      discountPence: 0,
      vatPence: 1_180,
      nhilComponentPence: 200,
      getFundComponentPence: 200,
      totalPence: 9_180,
      lines: [
        line({
          productId: 'a',
          lineSubtotalPence: 8_000,
          lineDiscountPence: 500,
          promoDiscountPence: 250,
          lineVatPence: 1_180,
          lineNhilComponentPence: 200,
          lineGetFundComponentPence: 200,
          lineVatComponentPence: 780,
          lineTotalPence: 8_430,
        }),
        line({ productId: 'b', lineSubtotalPence: 0, lineTotalPence: 0 }),
      ],
    };
    const result = rank(invoice);
    expect(result.ok).toBe(true);
    expect(result.lines.reduce((sum, row) => sum + row.amountPence, 0)).toBe(invoice.totalPence);
    expect(result.lines.find((row) => row.productId === 'b')?.amountPence).toBe(0);
  });

  it('allocates an invoice discount with half-up remainder on the largest eligible line', () => {
    const invoice: RankInvoice = {
      paymentStatus: 'PART_PAID',
      discountPence: 100,
      vatPence: 1_455,
      nhilComponentPence: 0,
      getFundComponentPence: 0,
      totalPence: 11_355,
      lines: [
        line({ productId: 'large', lineSubtotalPence: 6_000, lineVatPence: 900, lineTotalPence: 6_900 }),
        line({ productId: 'small', lineSubtotalPence: 4_000, lineVatPence: 600, lineTotalPence: 4_600 }),
      ],
    };
    const result = rank(invoice);
    expect(result.ok).toBe(true);
    expect(result.lines.reduce((sum, row) => sum + row.amountPence, 0)).toBe(invoice.totalPence);
    const large = result.lines.find((row) => row.productId === 'large')!;
    const small = result.lines.find((row) => row.productId === 'small')!;
    expect(large.amountPence).not.toBe(6_900);
    expect(large.amountPence + small.amountPence).toBe(11_355);
    expect(large.amountPence).toBeGreaterThan(small.amountPence);
  });

  it('ranks RETURNED and VOID invoices at zero', () => {
    for (const paymentStatus of ['RETURNED', 'VOID']) {
      const result = rank({ ...ordinary, paymentStatus });
      expect(result.ok).toBe(true);
      expect(result.lines.every((row) => row.amountPence === 0)).toBe(true);
      expect(result.lines.reduce((sum, row) => sum + row.amountPence, 0)).toBe(0);
    }
  });

  it('fails closed when stored lines cannot reach the invoice total', () => {
    const result = rank({
      paymentStatus: 'PAID',
      discountPence: 0,
      vatPence: 0,
      nhilComponentPence: 0,
      getFundComponentPence: 0,
      totalPence: 5_000,
      lines: [line({ productId: 'zero', lineSubtotalPence: 0, lineTotalPence: 0 })],
    });
    expect(result.ok).toBe(false);
    expect(result.differencePence).toBe(5_000);
  });

  it('the four Wave A callers share the reconciling rank function', () => {
    const files = [
      'lib/reports/business-movement/query.ts',
      'app/(protected)/reports/analytics/AnalyticsContent.tsx',
      'lib/reports/supplier-sales.ts',
      'lib/reports/weekly-digest.ts',
    ];
    for (const file of files) {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(source, file).toContain('rankRecognisedProductSales');
    }
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  allocateInvoiceDiscountHalfUp,
  evaluateMarginSet,
  lineNetBeforeTaxPence,
  resolveAuthoritativeLineCost,
} from '@/lib/reports/margin-line';
import * as marginLine from '@/lib/reports/margin-line';

const digest = readFileSync(path.join(process.cwd(), 'lib/reports/weekly-digest.ts'), 'utf8');

const invoice = {
  paymentStatus: 'PAID',
  discountPence: 100,
  lines: [
    {
      productId: 'rice',
      name: 'Rice',
      lineSubtotalPence: 10_000,
      lineDiscountPence: 500,
      promoDiscountPence: 250,
      lineCostPence: 4_000,
      qtyBase: 2,
    },
    {
      productId: 'oil',
      name: 'Oil',
      lineSubtotalPence: 6_000,
      lineDiscountPence: 0,
      promoDiscountPence: 100,
      lineCostPence: 3_000,
      qtyBase: 1,
    },
  ],
};

describe('A1 weekly digest top margin uses evaluated lines', () => {
  it('allocated line revenue and profit sum to the margin set', () => {
    expect(typeof (marginLine as { evaluateMarginLines?: unknown }).evaluateMarginLines).toBe('function');
    const evaluateMarginLines = (marginLine as {
      evaluateMarginLines: (invoices: unknown[]) => {
        state: string;
        lines: Array<{ revenuePence: number; profitPence: number | null; ready: boolean }>;
      };
    }).evaluateMarginLines;
    const set = evaluateMarginSet([invoice]);
    const evaluated = evaluateMarginLines([invoice]);
    const revenueSum = evaluated.lines.reduce((sum, line) => sum + line.revenuePence, 0);
    const profitSum = evaluated.lines.reduce((sum, line) => sum + (line.profitPence ?? 0), 0);
    expect(revenueSum).toBe(set.recognisedSalesPence);
    expect(profitSum).toBe(set.grossProfitPence);
    expect(evaluated.lines.every((line) => line.ready)).toBe(true);

    const nets = invoice.lines.map((line) => lineNetBeforeTaxPence(line));
    const shares = allocateInvoiceDiscountHalfUp(nets, invoice.discountPence);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100);
    const largest = nets[0] >= nets[1] ? 0 : 1;
    expect(shares[largest]).toBeGreaterThanOrEqual(shares[1 - largest]);
    evaluated.lines.forEach((line, index) => {
      const cost = resolveAuthoritativeLineCost(invoice.lines[index]);
      expect(line.revenuePence).toBe(nets[index] - shares[index]);
      expect(line.profitPence).toBe(line.revenuePence - (cost.costPence ?? 0));
    });
  });

  it('weekly digest top margin consumes evaluated line profit', () => {
    expect(digest).toContain('evaluateMarginLines');
    expect(digest).not.toMatch(/profit \+= productRankRevenuePence/);
    expect(digest).not.toContain('grossMarginPence: true');
    expect(digest).not.toContain('/ 100');
    expect(digest).toMatch(/topMargin[\s\S]{0,400}INCOMPLETE_COSTS|state !== 'READY'/);
  });
});

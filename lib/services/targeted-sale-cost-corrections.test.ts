import { describe, expect, it } from 'vitest';
import {
  buildHistoricalSaleLineCandidate,
  buildInvoiceGrossMarginMap,
} from './targeted-sale-cost-corrections';

describe('buildHistoricalSaleLineCandidate', () => {
  it('builds a before-vs-after correction preview using the current product cost', () => {
    const candidate = buildHistoricalSaleLineCandidate({
      id: 'line-1',
      salesInvoiceId: 'invoice-1',
      transactionNumber: 'INV-001201',
      createdAt: new Date('2026-04-01T09:00:00.000Z'),
      productId: 'product-1',
      productName: 'Safety Matches',
      sku: 'MATCH-01',
      unitName: 'piece',
      qtyInUnit: 10,
      qtyBase: 10,
      unitPricePence: 600,
      lineSubtotalPence: 6_000,
      lineTotalPence: 6_900,
      lineCostPence: 9_000,
      currentProductCostBasePence: 350,
    });

    expect(candidate.storedUnitCostBasePence).toBe(900);
    expect(candidate.correctedLineCostPence).toBe(3_500);
    expect(candidate.profitBeforePence).toBe(-3_000);
    expect(candidate.profitAfterPence).toBe(2_500);
    expect(candidate.belowCostBefore).toBe(true);
    expect(candidate.belowCostAfter).toBe(false);
    expect(candidate.needsCorrection).toBe(true);
  });
});

describe('buildInvoiceGrossMarginMap', () => {
  it('recalculates invoice-level gross margin from corrected line costs', () => {
    const result = buildInvoiceGrossMarginMap([
      { salesInvoiceId: 'invoice-1', lineSubtotalPence: 1_200, lineCostPence: 600 },
      { salesInvoiceId: 'invoice-1', lineSubtotalPence: 900, lineCostPence: 500 },
      { salesInvoiceId: 'invoice-2', lineSubtotalPence: 500, lineCostPence: 300 },
    ]);

    expect(result.get('invoice-1')).toBe(1_000);
    expect(result.get('invoice-2')).toBe(200);
  });
});
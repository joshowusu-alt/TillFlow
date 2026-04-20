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

  it('uses the current setup cost when stored line cost is zero', () => {
    const candidate = buildHistoricalSaleLineCandidate({
      id: 'line-2',
      salesInvoiceId: 'invoice-2',
      transactionNumber: 'INV-001202',
      createdAt: new Date('2026-04-01T10:00:00.000Z'),
      productId: 'product-2',
      productName: 'Milk Powder',
      sku: 'MILK-02',
      unitName: 'tin',
      qtyInUnit: 2,
      qtyBase: 2,
      unitPricePence: 700,
      lineSubtotalPence: 1_400,
      lineTotalPence: 1_400,
      lineCostPence: 0,
      currentProductCostBasePence: 900,
    });

    expect(candidate.storedUnitCostBasePence).toBe(0);
    expect(candidate.correctedLineCostPence).toBe(1_800);
    expect(candidate.profitBeforePence).toBe(-400);
    expect(candidate.belowCostBefore).toBe(true);
    expect(candidate.needsCorrection).toBe(true);
  });

  it('prefers movement cost over current product cost when movement is present', () => {
    // Movement recorded cost at 400/base; current product setup cost has drifted to 600.
    // The correction should target 400 (the stable movement anchor), not 600.
    const candidate = buildHistoricalSaleLineCandidate({
      id: 'line-3',
      salesInvoiceId: 'invoice-3',
      transactionNumber: 'INV-001203',
      createdAt: new Date('2026-04-01T11:00:00.000Z'),
      productId: 'product-3',
      productName: 'Cooking Oil',
      sku: 'OIL-03',
      unitName: 'litre',
      qtyInUnit: 5,
      qtyBase: 5,
      unitPricePence: 300,
      lineSubtotalPence: 1_500,
      lineTotalPence: 1_500,
      lineCostPence: 0,
      currentProductCostBasePence: 600,
      movementUnitCostBasePence: 400,
    });

    expect(candidate.correctedUnitCostBasePence).toBe(400);
    expect(candidate.correctedLineCostPence).toBe(2_000);
    expect(candidate.needsCorrection).toBe(true); // lineCostPence=0 ≠ 2000
  });

  it('does not re-flag a previously corrected line even when the product cost changes — no drift', () => {
    // Simulates the post-correction state:
    //   lineCostPence was corrected to 350 × 10 = 3500
    //   StockMovement.unitCostBasePence was updated to 350 at the same time
    //   Later the owner updated the product default cost to 600
    // Expected: needsCorrection = false — the line is stable and must not drift back.
    const candidate = buildHistoricalSaleLineCandidate({
      id: 'line-4',
      salesInvoiceId: 'invoice-4',
      transactionNumber: 'INV-001204',
      createdAt: new Date('2026-03-15T08:00:00.000Z'),
      productId: 'product-4',
      productName: 'Safety Matches',
      sku: 'MATCH-01',
      unitName: 'piece',
      qtyInUnit: 10,
      qtyBase: 10,
      unitPricePence: 600,
      lineSubtotalPence: 6_000,
      lineTotalPence: 6_000,
      lineCostPence: 3_500,
      currentProductCostBasePence: 600, // product cost changed since the correction
      movementUnitCostBasePence: 350,   // movement still holds the corrected value
    });

    expect(candidate.correctedUnitCostBasePence).toBe(350); // anchored to movement, not 600
    expect(candidate.correctedLineCostPence).toBe(3_500);
    expect(candidate.needsCorrection).toBe(false); // 3500 === 350 × 10 — no drift
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
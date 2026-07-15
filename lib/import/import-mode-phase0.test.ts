import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ACCOUNT_CODES } from '@/lib/accounting';
import {
  IMPORT_MODES,
  spreadsheetHasPaymentStatusColumn,
  templateHeadersForMode,
} from '@/lib/import/import-mode';

vi.mock('@/lib/prisma', () => {
  const stockMovement = { findFirst: vi.fn(), createMany: vi.fn() };
  const productUnit = { findMany: vi.fn() };
  const account = { findMany: vi.fn() };
  const inventoryBalance = {
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  };
  return {
    prisma: {
      stockMovement,
      productUnit,
      account,
      inventoryBalance,
      $transaction: async (fn: any) =>
        fn({
          stockMovement,
          inventoryBalance,
          journalEntry: { create: vi.fn().mockResolvedValue({ id: 'je1' }) },
          journalLine: { createMany: vi.fn() },
          account: { findMany: vi.fn().mockResolvedValue([]) },
        }),
    },
  };
});

vi.mock('@/lib/accounting', async () => {
  const actual = await vi.importActual<typeof import('@/lib/accounting')>('@/lib/accounting');
  return {
    ...actual,
    ensureChartOfAccounts: vi.fn().mockResolvedValue(undefined),
    postJournalEntry: vi.fn().mockResolvedValue({ id: 'je1' }),
  };
});

vi.mock('@/lib/services/shared/inventory-utils', () => ({
  fetchInventoryMap: vi.fn().mockResolvedValue(new Map()),
  incrementInventoryBalance: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@/lib/prisma';
import { postJournalEntry } from '@/lib/accounting';
import { recordOpeningInventory } from '@/lib/services/opening-inventory';
import { incompleteStockDisclosureMessage } from '@/lib/reports/incomplete-stock';

describe('Phase 0 import mode contracts', () => {
  it('exposes three import modes', () => {
    expect(IMPORT_MODES).toEqual(['CATALOGUE', 'OPENING_STOCK', 'PURCHASES']);
  });

  it('catalogue template has no payment_status', () => {
    expect(templateHeadersForMode('CATALOGUE')).not.toContain('payment_status');
    expect(templateHeadersForMode('CATALOGUE')).not.toContain('quantity');
  });

  it('opening-stock template has quantity but no payment_status', () => {
    expect(templateHeadersForMode('OPENING_STOCK')).toContain('quantity');
    expect(templateHeadersForMode('OPENING_STOCK')).not.toContain('payment_status');
  });

  it('purchase template retains payment_status', () => {
    expect(templateHeadersForMode('PURCHASES')).toContain('payment_status');
  });

  it('detects legacy payment_status headers', () => {
    expect(spreadsheetHasPaymentStatusColumn(['name', 'payment_status'])).toBe(true);
    expect(spreadsheetHasPaymentStatusColumn(['name', 'quantity'])).toBe(false);
  });

  it('chart includes Opening Balance Equity 3200', () => {
    expect(ACCOUNT_CODES.openingBalanceEquity).toBe('3200');
  });
});

describe('recordOpeningInventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.stockMovement.findFirst as any).mockResolvedValue(null);
    (prisma.productUnit.findMany as any).mockResolvedValue([
      {
        productId: 'p1',
        unitId: 'u1',
        conversionToBase: 1,
        product: { id: 'p1', businessId: 'b1', defaultCostBasePence: 0 },
      },
    ]);
  });

  it('posts Inventory / Opening Balance Equity for valued qty', async () => {
    const result = await recordOpeningInventory({
      businessId: 'b1',
      storeId: 's1',
      userId: 'user1',
      referenceId: 'ref-valued',
      lines: [{ productId: 'p1', unitId: 'u1', qtyInUnit: 10, unitCostBasePence: 200 }],
    });

    expect(result.valuedPence).toBe(2000);
    expect(result.journalPosted).toBe(true);
    expect(postJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceType: 'OPENING_BALANCE_INVENTORY',
        lines: expect.arrayContaining([
          expect.objectContaining({ accountCode: '1200', debitPence: 2000 }),
          expect.objectContaining({ accountCode: '3200', creditPence: 2000 }),
        ]),
      })
    );
  });

  it('does not invent zero-cost valuation journals', async () => {
    const result = await recordOpeningInventory({
      businessId: 'b1',
      storeId: 's1',
      referenceId: 'ref-nocost',
      lines: [{ productId: 'p1', unitId: 'u1', qtyInUnit: 5, unitCostBasePence: 0 }],
    });

    expect(result.valuedPence).toBe(0);
    expect(result.unvaluedUnits).toBe(5);
    expect(result.costReviewProductIds).toContain('p1');
    expect(result.journalPosted).toBe(false);
    expect(postJournalEntry).not.toHaveBeenCalled();
  });

  it('skips duplicate submission for the same referenceId', async () => {
    (prisma.stockMovement.findFirst as any).mockResolvedValue({ id: 'existing' });
    const result = await recordOpeningInventory({
      businessId: 'b1',
      storeId: 's1',
      referenceId: 'ref-dup',
      lines: [{ productId: 'p1', unitId: 'u1', qtyInUnit: 3, unitCostBasePence: 100 }],
    });
    expect(result.valuedPence).toBe(0);
    expect(postJournalEntry).not.toHaveBeenCalled();
  });
});

describe('incomplete stock disclosure', () => {
  it('explains incomplete value plainly', () => {
    expect(
      incompleteStockDisclosureMessage({
        productsWithUnvaluedQty: 2,
        unvaluedQtyBase: 12,
        costReviewProductIds: ['a', 'b'],
        soldWithoutCostProductIds: [],
        allMissingCostProductIds: ['a', 'b'],
        missingCostProductCount: 2,
        stockValueIncomplete: true,
        profitMayBeIncomplete: true,
      })
    ).toContain('incomplete');
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  IMPROVE_RECORDS_ISSUE_DEFS,
  resolveProductsIssueParam,
} from '@/lib/improve-records-issues';
import { computeImproveRecords, type ImproveRecordsSnapshot } from '@/lib/improve-records';

function base(overrides: Partial<ImproveRecordsSnapshot> = {}): ImproveRecordsSnapshot {
  return {
    onboardingComplete: true,
    saleCount: 10,
    productCount: 20,
    validProductCount: 20,
    sellableProductCount: 20,
    missingCostProductCount: 0,
    productsNeedingOpeningQtyCount: 0,
    soldWithoutConfirmedQtyCount: 0,
    unusedCatalogueProductCount: 0,
    stockValueIncomplete: false,
    openingBalancesStatus: 'complete',
    purchaseCount: 2,
    replenishmentWithoutPurchaseDetected: false,
    supplierCount: 1,
    purchasesNeedingSupplierCount: 0,
    staffCount: 1,
    pendingStaffInviteCount: 0,
    momoEnabled: false,
    momoNumber: null,
    momoProvider: null,
    momoActivityDetected: false,
    role: 'OWNER',
    plan: 'STARTER',
    ...overrides,
  };
}

describe('count/list destination consistency', () => {
  it('Home hrefs match shared issue definitions for every record-set recommendation', () => {
    const result = computeImproveRecords(
      base({
        missingCostProductCount: 2,
        productsNeedingOpeningQtyCount: 3,
        unusedCatalogueProductCount: 594,
        purchasesNeedingSupplierCount: 1,
        purchaseCount: 244,
      })
    );
    const byKey = Object.fromEntries(
      [result.primary, ...result.secondary].filter(Boolean).map((i) => [i!.key, i!.href])
    );
    expect(byKey['missing-costs']).toBe(IMPROVE_RECORDS_ISSUE_DEFS.MISSING_COST.href);
    expect(byKey['stock-completeness']).toBe(IMPROVE_RECORDS_ISSUE_DEFS.STOCK_SETUP_GAP.href);
    expect(byKey['suppliers']).toBe(IMPROVE_RECORDS_ISSUE_DEFS.MISSING_SUPPLIER.href);
    expect(byKey['unused-catalogue']).toBe(IMPROVE_RECORDS_ISSUE_DEFS.UNUSED_CATALOGUE.href);
  });

  it('legacy missingCost=1 resolves to the same MISSING_COST issue', () => {
    expect(resolveProductsIssueParam({ missingCost: '1' })).toBe('MISSING_COST');
    expect(IMPROVE_RECORDS_ISSUE_DEFS.MISSING_COST.href).toContain('issue=MISSING_COST');
  });

  it('EL-SHADDAI-shaped counts keep supplier primary and unused secondary with precise hrefs', () => {
    const result = computeImproveRecords(
      base({
        purchasesNeedingSupplierCount: 1,
        unusedCatalogueProductCount: 594,
        purchaseCount: 244,
        saleCount: 8000,
      })
    );
    expect(result.primary?.key).toBe('suppliers');
    expect(result.primary?.href).toBe('/purchases?issue=MISSING_SUPPLIER');
    expect(result.primary?.explanation).toContain('1 unpaid purchase');
    const unused = result.secondary.find((s) => s.key === 'unused-catalogue');
    expect(unused?.href).toBe('/products?issue=UNUSED_CATALOGUE');
    expect(unused?.explanation).toContain('594');
  });
});

describe('stale unused-catalogue deactivation guard', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('rejects deactivation when product is no longer in unusedCatalogueProductIds', async () => {
    vi.doMock('@/lib/action-utils', async () => {
      const actual = await vi.importActual<typeof import('@/lib/action-utils')>('@/lib/action-utils');
      return {
        ...actual,
        withBusinessContext: vi.fn(async () => ({
          user: { id: 'u1', name: 'Owner', role: 'OWNER' },
          businessId: 'b1',
        })),
      };
    });
    vi.doMock('@/lib/improve-records-load', () => ({
      listStockGapSignals: vi.fn(async () => ({
        productsNeedingOpeningQtyCount: 0,
        soldWithoutConfirmedQtyCount: 0,
        unusedCatalogueProductCount: 0,
        genuineGapProductIds: [],
        soldWithoutConfirmedQtyIds: [],
        unusedCatalogueProductIds: ['still-unused'],
      })),
    }));
    vi.doMock('@/lib/services/products', () => ({
      softDeleteProduct: vi.fn(async () => ({ name: 'Should not delete' })),
    }));
    vi.doMock('@/lib/audit', () => ({ audit: vi.fn(async () => undefined) }));
    vi.doMock('@/lib/reports/cache-revalidation', () => ({
      revalidateOwnerDashboardCache: vi.fn(),
    }));
    vi.doMock('next/cache', () => ({
      revalidatePath: vi.fn(),
      revalidateTag: vi.fn(),
    }));

    const { deactivateUnusedCatalogueProductAction } = await import('@/app/actions/products');
    const result = await deactivateUnusedCatalogueProductAction('already-stocked');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/no longer qualifies as unused catalogue/i);
    }
  });
});

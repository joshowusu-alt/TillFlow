import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_IMPROVE_KEYS,
  IMPROVE_RECORDS_ALL_CLEAR_MESSAGE,
  UNUSED_CATALOGUE_AGE_DAYS,
  buildImproveRecordsCandidates,
  computeImproveRecords,
  type ImproveRecordsSnapshot,
} from '@/lib/improve-records';
import {
  openingBalancesNeedsAttention,
  resolveOpeningBalancesStatus,
} from '@/lib/opening-balances-status';

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

describe('Opening balances status', () => {
  it('one non-core row does not complete the workflow', () => {
    expect(resolveOpeningBalancesStatus([{ accountCode: '1200' }])).toBe('in_progress');
    expect(resolveOpeningBalancesStatus([{ accountCode: '1100' }])).toBe('in_progress');
    expect(openingBalancesNeedsAttention('in_progress')).toBe(true);
  });

  it('cash + bank rows mark complete', () => {
    expect(
      resolveOpeningBalancesStatus([{ accountCode: '1000' }, { accountCode: '1010' }])
    ).toBe('complete');
    expect(openingBalancesNeedsAttention('complete')).toBe(false);
  });

  it('empty rows are not started', () => {
    expect(resolveOpeningBalancesStatus([])).toBe('not_started');
  });

  it('supports explicit deferred when provided', () => {
    expect(resolveOpeningBalancesStatus([], { intentionallyDeferred: true })).toBe('deferred');
    expect(openingBalancesNeedsAttention('deferred')).toBe(false);
  });
});

describe('Improve Your Records recommendation engine', () => {
  it('exports a named unused-catalogue age threshold', () => {
    expect(UNUSED_CATALOGUE_AGE_DAYS).toBe(14);
  });

  it('1. Missing product costs are primary with filtered deep link and clear wording', () => {
    const result = computeImproveRecords(
      base({ missingCostProductCount: 12, openingBalancesStatus: 'not_started' })
    );
    expect(result.primary?.key).toBe('missing-costs');
    expect(result.primary?.href).toBe('/products?issue=MISSING_COST');
    expect(result.primary?.explanation).toContain(
      'stocked or sold without a reliable cost'
    );
    expect(result.primary?.explanation).toContain('12');
  });

  it('sold-out missing-cost products still surface via missingCostProductCount', () => {
    const result = computeImproveRecords(
      base({
        missingCostProductCount: 3,
        sellableProductCount: 0,
        productsNeedingOpeningQtyCount: 0,
      })
    );
    expect(result.primary?.key).toBe('missing-costs');
  });

  it('2. Genuine stock gap uses confirmed-qty wording', () => {
    const result = computeImproveRecords(
      base({
        productsNeedingOpeningQtyCount: 18,
        soldWithoutConfirmedQtyCount: 0,
        sellableProductCount: 4,
        validProductCount: 20,
      })
    );
    expect(result.primary?.key).toBe('stock-completeness');
    expect(result.primary?.explanation).toContain(
      '18 active products still need a confirmed stock quantity'
    );
    expect(result.primary?.href).toBe('/products?issue=STOCK_SETUP_GAP');
  });

  it('Connys-shaped: sold without confirmed quantity keeps genuine stock coaching', () => {
    const result = computeImproveRecords(
      base({
        productsNeedingOpeningQtyCount: 3,
        soldWithoutConfirmedQtyCount: 3,
        unusedCatalogueProductCount: 0,
        openingBalancesStatus: 'complete',
        purchaseCount: 0,
        saleCount: 30,
      })
    );
    expect(result.primary?.key).toBe('stock-completeness');
    expect(result.primary?.explanation).toContain(
      'sold without a confirmed stock quantity'
    );
  });

  it('genuinely out-of-stock products (no opening-qty gap) do not trigger stock-completeness', () => {
    const keys = buildImproveRecordsCandidates(
      base({
        productsNeedingOpeningQtyCount: 0,
        sellableProductCount: 0,
        validProductCount: 10,
        openingBalancesStatus: 'complete',
      })
    ).map((i) => i.key);
    expect(keys).not.toContain('stock-completeness');
  });

  it('sold-out / balance-zero / purchase-history / stocktake / opening history stay out of stock gap', () => {
    // Engine receives loader counts already filtered; zero gap must not invent stock coaching.
    const keys = buildImproveRecordsCandidates(
      base({
        productsNeedingOpeningQtyCount: 0,
        soldWithoutConfirmedQtyCount: 0,
        unusedCatalogueProductCount: 0,
        sellableProductCount: 0,
        validProductCount: 50,
      })
    ).map((i) => i.key);
    expect(keys).not.toContain('stock-completeness');
  });

  it('aged unused catalogue is not described as unfinished opening stock', () => {
    const result = computeImproveRecords(
      base({
        productsNeedingOpeningQtyCount: 0,
        unusedCatalogueProductCount: 594,
        openingBalancesStatus: 'complete',
        purchasesNeedingSupplierCount: 0,
        purchaseCount: 10,
      })
    );
    expect(result.primary?.key).toBe('unused-catalogue');
    expect(result.primary?.title).toBe('Review unused catalogue products');
    expect(result.primary?.explanation).toContain('never been stocked or sold');
    expect(result.primary?.explanation).not.toContain('opening quantity');
    expect(result.primary?.href).toBe('/products?issue=UNUSED_CATALOGUE');
  });

  it('EL-SHADDAI-shaped: unused catalogue does not outrank genuine unpaid supplier', () => {
    const result = computeImproveRecords(
      base({
        productsNeedingOpeningQtyCount: 0,
        unusedCatalogueProductCount: 594,
        purchasesNeedingSupplierCount: 1,
        purchaseCount: 244,
        supplierCount: 65,
        openingBalancesStatus: 'complete',
        saleCount: 8000,
      })
    );
    expect(result.primary?.key).toBe('suppliers');
    expect(result.primary?.title).toBe('Link a supplier');
    expect(result.primary?.explanation).toBe(
      '1 unpaid purchase is missing a supplier, so the amount owed cannot be tracked clearly.'
    );
    expect(result.secondary.some((s) => s.key === 'unused-catalogue')).toBe(true);
  });

  it('paid cash / opening-stock null suppliers do not trigger supplier coaching (count=0)', () => {
    const keys = buildImproveRecordsCandidates(
      base({
        purchaseCount: 18,
        supplierCount: 65,
        purchasesNeedingSupplierCount: 0,
        unusedCatalogueProductCount: 0,
      })
    ).map((i) => i.key);
    expect(keys).not.toContain('suppliers');
  });

  it('Steffi-shaped: opening-stock invoices must not produce supplier coaching', () => {
    const keys = buildImproveRecordsCandidates(
      base({
        purchaseCount: 2,
        supplierCount: 0,
        purchasesNeedingSupplierCount: 0,
        productsNeedingOpeningQtyCount: 0,
        unusedCatalogueProductCount: 0,
        openingBalancesStatus: 'complete',
        saleCount: 2,
      })
    ).map((i) => i.key);
    expect(keys).not.toContain('suppliers');
  });

  it('JoCon-shaped: partially paid purchase without supplier remains visible', () => {
    const result = computeImproveRecords(
      base({
        purchaseCount: 1,
        supplierCount: 0,
        purchasesNeedingSupplierCount: 1,
        productsNeedingOpeningQtyCount: 0,
        unusedCatalogueProductCount: 0,
        openingBalancesStatus: 'complete',
        saleCount: 6,
      })
    );
    expect(result.primary?.key).toBe('suppliers');
    expect(result.primary?.explanation).toContain('1 unpaid purchase');
  });

  it('supplier plural wording is grammatically correct', () => {
    const result = computeImproveRecords(
      base({ purchasesNeedingSupplierCount: 3, purchaseCount: 5 })
    );
    expect(result.primary?.explanation).toBe(
      '3 unpaid purchases are missing a supplier, so amounts owed cannot be tracked clearly.'
    );
  });

  it('3. Opening balances not started vs in progress copy', () => {
    const notStarted = computeImproveRecords(
      base({ openingBalancesStatus: 'not_started', saleCount: 3 })
    );
    expect(notStarted.primary?.key).toBe('opening-balances');
    expect(notStarted.primary?.title).toBe('Complete your starting balances');

    const inProgress = computeImproveRecords(
      base({ openingBalancesStatus: 'in_progress', saleCount: 3 })
    );
    expect(inProgress.primary?.title).toBe('Finish your starting balances');
    expect(inProgress.primary?.explanation.toLowerCase()).not.toContain('opening capital');
  });

  it('opening balances complete removes the recommendation', () => {
    const keys = buildImproveRecordsCandidates(
      base({ openingBalancesStatus: 'complete' })
    ).map((i) => i.key);
    expect(keys).not.toContain('opening-balances');
  });

  it('intentionally deferred opening balances do not appear', () => {
    const keys = buildImproveRecordsCandidates(
      base({ openingBalancesStatus: 'deferred', saleCount: 8 })
    ).map((i) => i.key);
    expect(keys).not.toContain('opening-balances');
  });

  it('4. Purchase guidance wording after meaningful activity', () => {
    const result = computeImproveRecords(
      base({
        purchaseCount: 0,
        saleCount: 8,
        openingBalancesStatus: 'complete',
      })
    );
    expect(result.primary?.key).toBe('purchases');
    expect(result.primary?.title).toBe('Record your next stock delivery');
    expect(result.primary?.explanation).toContain('When new stock arrives');
    expect(result.primary?.href).toBe('/purchases#record-purchase-form');
  });

  it('supplier deep link is the filtered MISSING_SUPPLIER queue', () => {
    const result = computeImproveRecords(
      base({
        purchasesNeedingSupplierCount: 1,
        purchaseCount: 10,
        openingBalancesStatus: 'complete',
      })
    );
    expect(result.primary?.key).toBe('suppliers');
    expect(result.primary?.href).toBe('/purchases?issue=MISSING_SUPPLIER');
  });

  it('replenishment without purchase prioritises purchase guidance earlier', () => {
    const result = computeImproveRecords(
      base({
        purchaseCount: 0,
        saleCount: 2,
        replenishmentWithoutPurchaseDetected: true,
        openingBalancesStatus: 'complete',
        productsNeedingOpeningQtyCount: 0,
      })
    );
    expect(result.primary?.key).toBe('purchases');
  });

  it('5. Purchases recorded removes purchases recommendation', () => {
    const keys = buildImproveRecordsCandidates(
      base({ purchaseCount: 3, saleCount: 20 })
    ).map((i) => i.key);
    expect(keys).not.toContain('purchases');
  });

  it('6. Suppliers only for genuine unpaid payable gaps', () => {
    const hidden = buildImproveRecordsCandidates(
      base({ purchaseCount: 0, supplierCount: 0, saleCount: 2 })
    ).map((i) => i.key);
    expect(hidden).not.toContain('suppliers');

    const shown = computeImproveRecords(
      base({
        purchaseCount: 4,
        supplierCount: 0,
        purchasesNeedingSupplierCount: 2,
      })
    );
    expect(shown.primary?.key).toBe('suppliers');
  });

  it('7–8. Owner-only staff stays hidden; unfinished invite shows', () => {
    expect(
      buildImproveRecordsCandidates(base({ pendingStaffInviteCount: 0 })).map((i) => i.key)
    ).not.toContain('staff');

    expect(
      computeImproveRecords(
        base({ pendingStaffInviteCount: 1, staffCount: 1 })
      ).primary?.key
    ).toBe('staff');
  });

  it('9–10. MoMo unused hidden; MoMo missing details shown', () => {
    expect(
      buildImproveRecordsCandidates(base({ momoEnabled: false })).map((i) => i.key)
    ).not.toContain('momo');

    const result = computeImproveRecords(
      base({ momoEnabled: true, momoNumber: null, momoProvider: null })
    );
    expect(result.primary?.key).toBe('momo');
    expect(result.primary?.href).toBe('/settings#payments');
  });

  it('11–12. Billing and reports never appear', () => {
    const keys = buildImproveRecordsCandidates(
      base({ openingBalancesStatus: 'not_started' })
    ).map((i) => i.key);
    for (const forbidden of FORBIDDEN_IMPROVE_KEYS) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('13. Completed improvements disappear and priority recalculates', () => {
    const before = computeImproveRecords(
      base({
        missingCostProductCount: 5,
        openingBalancesStatus: 'not_started',
        productsNeedingOpeningQtyCount: 2,
      })
    );
    expect(before.primary?.key).toBe('missing-costs');
    expect(before.secondary[0]?.key).toBe('stock-completeness');

    const afterCosts = computeImproveRecords(
      base({
        missingCostProductCount: 0,
        openingBalancesStatus: 'not_started',
        productsNeedingOpeningQtyCount: 2,
      })
    );
    expect(afterCosts.primary?.key).toBe('stock-completeness');

    const afterStock = computeImproveRecords(
      base({
        missingCostProductCount: 0,
        openingBalancesStatus: 'not_started',
        productsNeedingOpeningQtyCount: 0,
      })
    );
    expect(afterStock.primary?.key).toBe('opening-balances');
  });

  it('14. Maximum one primary + three secondary', () => {
    const result = computeImproveRecords(
      base({
        missingCostProductCount: 3,
        productsNeedingOpeningQtyCount: 5,
        openingBalancesStatus: 'in_progress',
        purchaseCount: 0,
        saleCount: 10,
        validProductCount: 3,
        purchasesNeedingSupplierCount: 2,
        unusedCatalogueProductCount: 40,
        momoEnabled: true,
        pendingStaffInviteCount: 1,
      })
    );
    expect(result.primary).not.toBeNull();
    expect(result.secondary.length).toBeLessThanOrEqual(3);
    expect(1 + result.secondary.length).toBeLessThanOrEqual(4);
  });

  it('15. No meaningful gaps shows quiet success state', () => {
    const result = computeImproveRecords(
      base({
        missingCostProductCount: 0,
        productsNeedingOpeningQtyCount: 0,
        unusedCatalogueProductCount: 0,
        openingBalancesStatus: 'complete',
        purchaseCount: 5,
        supplierCount: 2,
        purchasesNeedingSupplierCount: 0,
        validProductCount: 20,
      })
    );
    expect(result.allClear).toBe(true);
    expect(result.primary).toBeNull();
    expect(result.allClearMessage).toBe(IMPROVE_RECORDS_ALL_CLEAR_MESSAGE);
  });

  it('16. Role filtering', () => {
    const manager = buildImproveRecordsCandidates(
      base({
        role: 'MANAGER',
        pendingStaffInviteCount: 1,
        momoEnabled: true,
        openingBalancesStatus: 'not_started',
        missingCostProductCount: 2,
      })
    ).map((i) => i.key);
    expect(manager).toContain('missing-costs');
    expect(manager).not.toContain('staff');
    expect(manager).not.toContain('momo');
    expect(manager).not.toContain('opening-balances');

    expect(buildImproveRecordsCandidates(base({ role: 'CASHIER', missingCostProductCount: 4 }))).toEqual(
      []
    );
  });

  it('17. Plan filtering keeps record-quality items on Starter', () => {
    const starter = buildImproveRecordsCandidates(
      base({
        plan: 'STARTER',
        missingCostProductCount: 2,
        openingBalancesStatus: 'not_started',
      })
    ).map((i) => i.key);
    expect(starter).toContain('missing-costs');
    expect(starter).toContain('opening-balances');
  });

  it('18. Exact deep links', () => {
    const hrefs = Object.fromEntries(
      buildImproveRecordsCandidates(
        base({
          missingCostProductCount: 1,
          productsNeedingOpeningQtyCount: 2,
          openingBalancesStatus: 'in_progress',
          purchaseCount: 0,
          saleCount: 10,
          pendingStaffInviteCount: 1,
          momoEnabled: true,
        })
      ).map((i) => [i.key, i.href])
    );
    expect(hrefs['missing-costs']).toBe('/products?issue=MISSING_COST');
    expect(hrefs['stock-completeness']).toBe('/products?issue=STOCK_SETUP_GAP');
    expect(hrefs['opening-balances']).toBe('/settings#opening-capital');
    expect(hrefs['purchases']).toBe('/purchases#record-purchase-form');
    expect(hrefs['staff']).toBe('/users');
    expect(hrefs['momo']).toBe('/settings#payments');
  });

  it('19. First-sale onboarding unaffected', () => {
    const result = computeImproveRecords(
      base({
        onboardingComplete: false,
        saleCount: 0,
        missingCostProductCount: 99,
        productsNeedingOpeningQtyCount: 40,
        unusedCatalogueProductCount: 500,
      })
    );
    expect(result.primary).toBeNull();
    expect(result.secondary).toEqual([]);
  });

  it('20. Command Center urgency remains separate', () => {
    const keys = buildImproveRecordsCandidates(base()).map((i) => i.key);
    expect(keys).not.toContain('open-shift');
    expect(keys).not.toContain('cash-variance');
    expect(keys).not.toContain('low-stock');
    expect(keys).not.toContain('overdue-supplier');
    expect(keys).not.toContain('pending-payments');
  });

  it('cash-only opening balance stays in progress', () => {
    expect(resolveOpeningBalancesStatus([{ accountCode: '1000' }])).toBe('in_progress');
    expect(
      computeImproveRecords(
        base({ openingBalancesStatus: 'in_progress', saleCount: 4 })
      ).primary?.title
    ).toBe('Finish your starting balances');
  });

  it('catalogue only when genuinely thin after meaningful trading', () => {
    expect(
      buildImproveRecordsCandidates(
        base({ validProductCount: 4, saleCount: 10, missingCostProductCount: 0 })
      ).map((i) => i.key)
    ).not.toContain('catalogue');

    expect(
      computeImproveRecords(
        base({ validProductCount: 2, saleCount: 10, missingCostProductCount: 0 })
      ).primary?.key
    ).toBe('catalogue');
  });
});

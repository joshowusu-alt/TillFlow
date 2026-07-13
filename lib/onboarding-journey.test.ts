import { describe, expect, it } from 'vitest';
import {
  computeOnboardingJourney,
  getJourneyProgressPercent,
  isReadyToSell,
  resolveOnboardingUpNext,
  type OnboardingJourneySnapshot,
} from './onboarding-journey';

function snap(partial: Partial<OnboardingJourneySnapshot> = {}): OnboardingJourneySnapshot {
  return {
    name: '',
    businessCategory: null,
    validProductCount: 0,
    sellableProductCount: 0,
    productCount: 0,
    saleCount: 0,
    onboardingCompletedAt: null,
    ...partial,
  };
}

describe('Phase 1 onboarding journey', () => {
  it('1. Missing business name → up next business-name', () => {
    const result = computeOnboardingJourney(snap({ businessCategory: 'SUPERMARKET' }));
    expect(result.status).toBe('GETTING_READY');
    expect(result.upNext?.key).toBe('business-name');
    expect(result.hasBusinessName).toBe(false);
  });

  it('2. Missing business type → up next business-type', () => {
    const result = computeOnboardingJourney(snap({ name: 'Ama Store' }));
    expect(result.upNext?.key).toBe('business-type');
    expect(result.hasBusinessType).toBe(false);
  });

  it('3. No products → up next add-product', () => {
    const result = computeOnboardingJourney(
      snap({ name: 'Ama Store', businessCategory: 'MINI_MART' })
    );
    expect(result.upNext?.key).toBe('add-product');
  });

  it('4. Product with no selling price does not count as valid', () => {
    const result = computeOnboardingJourney(
      snap({
        name: 'Ama Store',
        businessCategory: 'MINI_MART',
        productCount: 5,
        validProductCount: 0,
      })
    );
    expect(result.hasValidProduct).toBe(false);
    expect(result.upNext?.key).toBe('add-product');
  });

  it('5. Stock-tracked product with zero quantity blocks Ready to sell', () => {
    const result = computeOnboardingJourney(
      snap({
        name: 'Ama Store',
        businessCategory: 'MINI_MART',
        productCount: 2,
        validProductCount: 2,
        sellableProductCount: 0,
      })
    );
    expect(result.hasValidProduct).toBe(true);
    expect(result.hasSellableProduct).toBe(false);
    expect(isReadyToSell(snap({
      name: 'Ama Store',
      businessCategory: 'MINI_MART',
      validProductCount: 2,
      sellableProductCount: 0,
    }))).toBe(false);
    expect(result.upNext?.key).toBe('add-stock');
    expect(result.zeroStockBlockMessage).toMatch(/Add stock to at least one product/i);
  });

  it('6. Stock-tracked product with positive quantity → Ready to sell', () => {
    const s = snap({
      name: 'Ama Store',
      businessCategory: 'MINI_MART',
      validProductCount: 1,
      sellableProductCount: 1,
      productCount: 1,
    });
    expect(isReadyToSell(s)).toBe(true);
    const result = computeOnboardingJourney(s);
    expect(result.status).toBe('READY_TO_SELL');
    expect(result.upNext?.isStartSelling).toBe(true);
    expect(result.stockDeferredMessage).toMatch(/complete the rest/i);
  });

  it('7. Catalogue import with zero stock stays Getting ready for stock', () => {
    const result = computeOnboardingJourney(
      snap({
        name: 'Ama Store',
        businessCategory: 'MINI_MART',
        validProductCount: 40,
        sellableProductCount: 0,
        productCount: 40,
      })
    );
    expect(result.status).toBe('GETTING_READY');
    expect(result.upNext?.key).toBe('add-stock');
  });

  it('8. Opening-stock import with sellable product → Ready to sell', () => {
    const result = computeOnboardingJourney(
      snap({
        name: 'Ama Store',
        businessCategory: 'MINI_MART',
        validProductCount: 10,
        sellableProductCount: 3,
      })
    );
    expect(result.status).toBe('READY_TO_SELL');
  });

  it('9. Partial import — some sellable is enough', () => {
    const result = computeOnboardingJourney(
      snap({
        name: 'Ama Store',
        businessCategory: 'MINI_MART',
        validProductCount: 20,
        sellableProductCount: 1,
        productCount: 50,
      })
    );
    expect(result.status).toBe('READY_TO_SELL');
    expect(result.upNext?.key).toBe('start-selling');
  });

  it('10. Start selling up-next only navigates (isStartSelling)', () => {
    const up = resolveOnboardingUpNext(
      snap({
        name: 'Ama Store',
        businessCategory: 'MINI_MART',
        validProductCount: 1,
        sellableProductCount: 1,
      })
    );
    expect(up?.isStartSelling).toBe(true);
    expect(up?.href).toBe('/pos');
  });

  it('11–12. Failed / voided sales do not count (saleCount stays 0)', () => {
    const result = computeOnboardingJourney(
      snap({
        name: 'Ama Store',
        businessCategory: 'MINI_MART',
        validProductCount: 1,
        sellableProductCount: 1,
        saleCount: 0,
      })
    );
    expect(result.onboardingComplete).toBe(false);
    expect(result.status).toBe('READY_TO_SELL');
  });

  it('13. First successful sale completes onboarding journey', () => {
    const result = computeOnboardingJourney(
      snap({
        name: 'Ama Store',
        businessCategory: 'MINI_MART',
        validProductCount: 1,
        sellableProductCount: 1,
        saleCount: 1,
      })
    );
    expect(result.hasFirstSale).toBe(true);
    expect(result.onboardingComplete).toBe(true);
    expect(result.status).toBe('FIRST_SALE_COMPLETE');
  });

  it('14. Refunded completed sale does not reopen (saleCount may stay ≥1; completedAt preserved)', () => {
    const result = computeOnboardingJourney(
      snap({
        name: 'Ama Store',
        businessCategory: 'MINI_MART',
        validProductCount: 1,
        sellableProductCount: 1,
        saleCount: 1,
        onboardingCompletedAt: new Date('2026-01-01'),
      })
    );
    expect(result.onboardingComplete).toBe(true);
    expect(result.status).toBe('IMPROVING_RECORDS');
  });

  it('15. Existing onboarded business stays complete without sale recount', () => {
    const result = computeOnboardingJourney(
      snap({
        name: 'Legacy Shop',
        businessCategory: 'SUPERMARKET',
        onboardingCompletedAt: new Date('2025-06-01'),
        saleCount: 0,
        validProductCount: 0,
        sellableProductCount: 0,
      })
    );
    expect(result.onboardingComplete).toBe(true);
    expect(result.status).toBe('IMPROVING_RECORDS');
  });

  it('16–20. Staff, supplier, purchase, payments, billing do not affect readiness', () => {
    // Journey snapshot has no staff/supplier/purchase/momo/billing fields — readiness ignores them.
    const ready = computeOnboardingJourney(
      snap({
        name: 'Ama Store',
        businessCategory: 'MINI_MART',
        validProductCount: 1,
        sellableProductCount: 1,
      })
    );
    expect(ready.status).toBe('READY_TO_SELL');
    expect(ready.optionalImprovements).toEqual([]);

    const afterSale = computeOnboardingJourney(
      snap({
        name: 'Ama Store',
        businessCategory: 'MINI_MART',
        validProductCount: 1,
        sellableProductCount: 1,
        saleCount: 2,
        onboardingCompletedAt: new Date(),
      })
    );
    expect(afterSale.optionalImprovements.map((i) => i.key)).toEqual(
      expect.arrayContaining(['staff', 'suppliers', 'payments', 'reports', 'billing'])
    );
    expect(afterSale.status).toBe('IMPROVING_RECORDS');
  });

  it('does not expose percentage in journey status labels', () => {
    expect(computeOnboardingJourney(snap()).statusLabel).not.toMatch(/%/);
    expect(getJourneyProgressPercent(snap({ name: 'A', businessCategory: 'OTHER' }))).toBe(25);
  });

  it('Up next order follows approved sequence', () => {
    expect(resolveOnboardingUpNext(snap())?.key).toBe('business-name');
    expect(resolveOnboardingUpNext(snap({ name: 'A' }))?.key).toBe('business-type');
    expect(
      resolveOnboardingUpNext(snap({ name: 'A', businessCategory: 'OTHER' }))?.key
    ).toBe('add-product');
    expect(
      resolveOnboardingUpNext(
        snap({ name: 'A', businessCategory: 'OTHER', validProductCount: 1 })
      )?.key
    ).toBe('add-stock');
    expect(
      resolveOnboardingUpNext(
        snap({
          name: 'A',
          businessCategory: 'OTHER',
          validProductCount: 1,
          sellableProductCount: 1,
        })
      )?.key
    ).toBe('start-selling');
  });
});

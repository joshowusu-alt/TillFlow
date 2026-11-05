import { describe, expect, it } from 'vitest';
import {
  cashDrawerLinkPlan,
  homeExpectedCashHref,
  homeExpectedCashStoreId,
  type HomeExpectedCashScope,
} from '@/lib/reports/home-expected-cash-link';

const today = {
  periodKey: 'today' as const,
  fromInputValue: '2026-08-07',
  toInputValue: '2026-08-07',
};

function storeIdOf(href: string): string | null {
  return new URL(href, 'http://localhost').searchParams.get('storeId');
}

describe('home Expected Cash cash-drawer link', () => {
  it('uses plan then mode, and ignores a higher selected plan', () => {
    expect(cashDrawerLinkPlan({ plan: 'GROWTH', mode: 'ADVANCED', storeMode: 'MULTI_STORE' })).toBe('GROWTH');
    expect(cashDrawerLinkPlan({ plan: 'STARTER', mode: 'ADVANCED', storeMode: 'MULTI_STORE' })).toBe('STARTER');
    expect(cashDrawerLinkPlan({ plan: null, mode: 'ADVANCED', storeMode: 'SINGLE_STORE' })).toBe('GROWTH');
    expect(cashDrawerLinkPlan({ plan: null, mode: 'ADVANCED', storeMode: 'MULTI_STORE' })).toBe('PRO');
    expect(cashDrawerLinkPlan({ plan: '  ', mode: 'SIMPLE', storeMode: 'SINGLE_STORE' })).toBe('STARTER');
    expect(cashDrawerLinkPlan({ plan: null, mode: null, storeMode: null })).toBe('STARTER');
  });

  it('links Growth and Starter to the operational or sole store, never ALL', () => {
    const cases: HomeExpectedCashScope[] = [
      { plan: 'GROWTH', ownedStoreIds: ['store-akwaaba'], operationalStoreId: null },
      { plan: 'GROWTH', ownedStoreIds: ['store-akwaaba'], operationalStoreId: 'store-akwaaba' },
      { plan: 'STARTER', ownedStoreIds: ['store-1'], operationalStoreId: null },
      { plan: 'GROWTH', ownedStoreIds: ['store-a', 'store-b'], operationalStoreId: 'store-b' },
      { plan: 'STARTER', ownedStoreIds: ['store-a', 'store-b'], operationalStoreId: 'store-a' },
    ];

    for (const scope of cases) {
      const href = homeExpectedCashHref(today, scope);
      const storeId = storeIdOf(href);
      expect(storeId, href).not.toBe('ALL');
      expect(href).not.toContain('storeId=ALL');
      expect(storeId).toBe(homeExpectedCashStoreId(scope));
      expect(href).toContain('period=today');
      expect(href).toContain('from=2026-08-07');
      expect(href).toContain('to=2026-08-07');
    }

    expect(homeExpectedCashStoreId(cases[0])).toBe('store-akwaaba');
    expect(homeExpectedCashStoreId(cases[3])).toBe('store-b');
  });

  it('omits storeId when Growth has several branches and none is selected', () => {
    const href = homeExpectedCashHref(today, {
      plan: 'GROWTH',
      ownedStoreIds: ['store-a', 'store-b'],
      operationalStoreId: null,
    });
    expect(storeIdOf(href)).toBeNull();
    expect(href).not.toContain('storeId=ALL');
    expect(homeExpectedCashStoreId({
      plan: 'GROWTH',
      ownedStoreIds: ['store-a', 'store-b'],
      operationalStoreId: 'store-foreign',
    })).toBeNull();
  });

  it('keeps ALL for Pro with more than one branch and uses the sole store otherwise', () => {
    expect(homeExpectedCashStoreId({
      plan: 'PRO',
      ownedStoreIds: ['store-a', 'store-b'],
      operationalStoreId: 'store-a',
    })).toBe('ALL');
    expect(storeIdOf(homeExpectedCashHref(today, {
      plan: 'PRO',
      ownedStoreIds: ['store-a', 'store-b'],
      operationalStoreId: 'store-a',
    }))).toBe('ALL');
    expect(homeExpectedCashStoreId({
      plan: 'PRO',
      ownedStoreIds: ['store-only'],
      operationalStoreId: null,
    })).toBe('store-only');
  });
});

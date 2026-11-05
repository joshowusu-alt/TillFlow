import { describe, expect, it } from 'vitest';
import { toPageAccess } from '@/lib/entitlements/adapters';
import { decideSurfaceAccess } from '@/lib/entitlements/decide';
import { resolveCanonicalPlan } from '@/lib/entitlements/plan';
import { SURFACE_CATALOGUE } from '@/lib/entitlements/surface-catalogue';
import type { EntitlementActor, SurfaceAccessInput } from '@/lib/entitlements/types';
import {
  cashDrawerLinkPlan,
  homeExpectedCashHref,
  homeExpectedCashStoreId,
} from '@/lib/reports/home-expected-cash-link';

const NOW = new Date('2026-09-28T12:00:00.000Z');
const TODAY = {
  periodKey: 'today' as const,
  fromInputValue: '2026-08-07',
  toInputValue: '2026-08-07',
};

const owner: EntitlementActor = {
  kind: 'USER',
  userId: 'user-1',
  businessId: 'biz-akwaaba',
  role: 'OWNER',
  active: true,
};

function decide(scope: SurfaceAccessInput['scope'], plan: 'STARTER' | 'GROWTH' | 'PRO') {
  return decideSurfaceAccess({
    surfaceId: 'cash_drawer_report',
    action: 'VIEW',
    actor: owner,
    business: {
      id: 'biz-akwaaba',
      plan,
      mode: null,
      storeMode: plan === 'PRO' ? 'MULTI_STORE' : 'SINGLE_STORE',
      addonOnlineStorefront: false,
      isDemo: true,
      billing: 'PAID_ACTIVE',
    },
    scope,
    now: NOW,
    timezone: 'Africa/Accra',
  });
}

describe('Growth Expected Cash navigation', () => {
  it('keeps the cash drawer on Starter and still forbids consolidated ALL below Pro', () => {
    const spec = SURFACE_CATALOGUE.cash_drawer_report;
    expect(spec.minPlan).toBe('STARTER');
    expect(spec.scopeClass).toBe('STORE_DIMENSIONAL');
    if (spec.scopeClass === 'STORE_DIMENSIONAL') {
      expect(spec.consolidationSupported).toBe(true);
    }
  });

  it('follows the cash drawer plan, not selectedPlan', () => {
    const sources = [
      { plan: 'GROWTH', mode: 'ADVANCED', storeMode: 'MULTI_STORE' },
      { plan: 'STARTER', mode: 'ADVANCED', storeMode: 'MULTI_STORE' },
      { plan: null, mode: 'ADVANCED', storeMode: 'SINGLE_STORE' },
      { plan: null, mode: 'ADVANCED', storeMode: 'MULTI_STORE' },
      { plan: '  PRO  ', mode: 'SIMPLE', storeMode: 'SINGLE_STORE' },
      { plan: '', mode: 'ADVANCED', storeMode: 'MULTI_STORE' },
      { plan: null, mode: null, storeMode: null },
    ];
    for (const source of sources) {
      expect(cashDrawerLinkPlan(source)).toBe(resolveCanonicalPlan(source));
    }
  });

  it('opens the cash drawer for a Growth business instead of the Pro all-branches wall', () => {
    const link = {
      plan: 'GROWTH' as const,
      ownedStoreIds: ['store-akwaaba'],
      operationalStoreId: 'store-akwaaba',
    };
    const href = homeExpectedCashHref(TODAY, link);
    const storeId = new URL(href, 'http://localhost').searchParams.get('storeId');

    expect(href.startsWith('/reports/cash-drawer?')).toBe(true);
    expect(storeId).toBe('store-akwaaba');
    expect(href).not.toContain('storeId=ALL');

    const allowed = decide(
      {
        ownedStoreIds: link.ownedStoreIds,
        operationalStoreId: link.operationalStoreId,
        requestedStoreId: storeId,
      },
      'GROWTH',
    );
    expect(allowed.ok).toBe(true);
    expect(toPageAccess(allowed, 'VIEW', owner)).toMatchObject({ outcome: 'allow' });

    const consolidated = decide(
      {
        ownedStoreIds: link.ownedStoreIds,
        operationalStoreId: link.operationalStoreId,
        requestedStoreId: 'ALL',
      },
      'GROWTH',
    );
    expect(consolidated).toMatchObject({ ok: false, reason: 'SCOPE_CONSOLIDATED_FORBIDDEN' });
    expect(toPageAccess(consolidated, 'VIEW', owner)).toMatchObject({
      outcome: 'notice',
      notice: 'consolidated',
    });
  });

  it('uses the selected branch for Growth with several stores, and ALL only for Pro', () => {
    const growth = {
      plan: 'GROWTH' as const,
      ownedStoreIds: ['store-a', 'store-b'],
      operationalStoreId: 'store-b',
    };
    expect(homeExpectedCashStoreId(growth)).toBe('store-b');
    expect(decide({
      ownedStoreIds: growth.ownedStoreIds,
      operationalStoreId: 'store-b',
      requestedStoreId: 'store-b',
    }, 'GROWTH').ok).toBe(true);
    expect(decide({
      ownedStoreIds: growth.ownedStoreIds,
      operationalStoreId: 'store-b',
      requestedStoreId: 'ALL',
    }, 'GROWTH')).toMatchObject({ ok: false, reason: 'SCOPE_CONSOLIDATED_FORBIDDEN' });

    const starter = {
      plan: 'STARTER' as const,
      ownedStoreIds: ['store-akwaaba'],
      operationalStoreId: null,
    };
    expect(homeExpectedCashStoreId(starter)).toBe('store-akwaaba');
    expect(decide({
      ownedStoreIds: ['store-akwaaba'],
      operationalStoreId: null,
      requestedStoreId: 'store-akwaaba',
    }, 'STARTER').ok).toBe(true);

    const pro = {
      plan: 'PRO' as const,
      ownedStoreIds: ['store-a', 'store-b'],
      operationalStoreId: 'store-a',
    };
    expect(homeExpectedCashStoreId(pro)).toBe('ALL');
    expect(decide({
      ownedStoreIds: pro.ownedStoreIds,
      operationalStoreId: 'store-a',
      requestedStoreId: 'ALL',
    }, 'PRO')).toMatchObject({ ok: true, scope: { mode: 'ALL' } });
  });
});

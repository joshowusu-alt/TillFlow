import { describe, expect, it } from 'vitest';
import { toPageAccess } from '@/lib/entitlements/adapters';
import { decideSurfaceAccess } from '@/lib/entitlements/decide';
import { earliestPermittedLocalDate } from '@/lib/entitlements/range';
import type { EntitlementActor, SurfaceAccessInput } from '@/lib/entitlements/types';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const TZ = 'Africa/Accra';

function user(role = 'OWNER'): EntitlementActor {
  return { kind: 'USER', userId: 'user-1', businessId: 'biz-1', role, active: true };
}

function decide(overrides: Partial<SurfaceAccessInput> = {}) {
  return decideSurfaceAccess({
    surfaceId: overrides.surfaceId ?? 'command_center',
    action: overrides.action ?? 'VIEW',
    actor: overrides.actor === undefined ? user() : overrides.actor,
    business: overrides.business ?? {
      id: 'biz-1',
      plan: 'GROWTH',
      mode: null,
      storeMode: 'SINGLE_STORE',
      addonOnlineStorefront: false,
      isDemo: false,
      billing: 'PAID_ACTIVE',
    },
    scope: overrides.scope ?? {
      ownedStoreIds: ['store-1', 'store-2'],
      operationalStoreId: 'store-1',
      subjectBusinessId: 'biz-1',
    },
    range: overrides.range,
    now: overrides.now ?? NOW,
    timezone: overrides.timezone ?? TZ,
  });
}

describe('Today entitlement gate', () => {
  it('allows Starter and Growth on one branch', () => {
    expect(decide({ business: { id: 'biz-1', plan: 'STARTER', billing: 'PAID_ACTIVE' } })).toMatchObject({
      ok: true,
      scope: { class: 'STORE_DIMENSIONAL', mode: 'STORE', storeId: 'store-1' },
    });
    expect(decide()).toMatchObject({
      ok: true,
      scope: { mode: 'STORE', storeId: 'store-1' },
    });
  });

  it('denies Growth consolidation and a foreign or empty store list before any report query', () => {
    expect(decide({
      scope: { ownedStoreIds: ['store-1', 'store-2'], operationalStoreId: 'store-1', requestedStoreId: 'ALL' },
    })).toMatchObject({ ok: false, reason: 'SCOPE_CONSOLIDATED_FORBIDDEN' });
    expect(decide({
      business: { id: 'biz-1', plan: 'PRO', billing: 'PAID_ACTIVE' },
      scope: { ownedStoreIds: ['store-1', 'store-2'], operationalStoreId: 'store-1', requestedStoreId: 'ALL' },
    })).toMatchObject({ ok: true, scope: { mode: 'ALL' } });
    expect(decide({
      scope: { ownedStoreIds: ['store-1'], operationalStoreId: 'store-1', requestedStoreId: 'store-foreign' },
    })).toMatchObject({ ok: false, reason: 'SCOPE_STORE_INVALID' });
    expect(decide({
      scope: { ownedStoreIds: [], operationalStoreId: null, requestedStoreId: null },
    })).toMatchObject({ ok: false, reason: 'SCOPE_STORE_UNSELECTED' });
  });

  it('keeps restricted view read-only and sends a cancelled account to billing', () => {
    const restricted = decide({ business: { id: 'biz-1', plan: 'GROWTH', billing: 'READ_ONLY' } });
    expect(restricted).toMatchObject({ ok: true, readOnly: true });
    const cancelled = decide({
      surfaceId: 'reports_hub',
      business: { id: 'biz-1', plan: 'GROWTH', billing: 'CANCELLED' },
    });
    expect(toPageAccess(cancelled, 'VIEW', user())).toEqual({
      outcome: 'redirect',
      href: '/settings/billing',
      reason: 'BILLING_CANCELLED',
    });
  });

  it('lets a manager open Today and keeps owner-only reports off the manager catalogue', () => {
    expect(decide({ actor: user('MANAGER'), surfaceId: 'reports_hub' })).toMatchObject({ ok: true });
    expect(decide({ actor: user('CASHIER'), surfaceId: 'reports_hub' })).toMatchObject({
      ok: false,
      reason: 'ROLE_FORBIDDEN',
    });
    expect(decide({ actor: user('MANAGER'), surfaceId: 'owner_brief' })).toMatchObject({ ok: false });
    expect(decide({
      actor: user('OWNER'),
      surfaceId: 'owner_brief',
      business: { id: 'biz-1', plan: 'PRO', billing: 'PAID_ACTIVE' },
    })).toMatchObject({ ok: true });
    expect(decide({
      actor: user('MANAGER'),
      surfaceId: 'audit_log',
      business: { id: 'biz-1', plan: 'PRO', billing: 'PAID_ACTIVE' },
    })).toMatchObject({ ok: false });
  });

  it('keeps the Starter horizon at today minus 29 local dates', () => {
    expect(earliestPermittedLocalDate('STARTER', '2026-09-30')).toBe('2026-09-01');
    const lawful = decide({
      business: { id: 'biz-1', plan: 'STARTER', billing: 'PAID_ACTIVE' },
      range: { fromLocalDate: '2026-09-01', toLocalDate: '2026-09-30', preset: 'CUSTOM' },
    });
    const tooEarly = decide({
      business: { id: 'biz-1', plan: 'STARTER', billing: 'PAID_ACTIVE' },
      range: { fromLocalDate: '2026-08-31', toLocalDate: '2026-09-30', preset: 'CUSTOM' },
    });
    expect(lawful).toMatchObject({ ok: true, appliedRange: { fromLocalDate: '2026-09-01', toLocalDate: '2026-09-30' } });
    expect(tooEarly).toMatchObject({ ok: false, reason: 'RANGE_EXCEEDS_PLAN' });
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decideBusinessCapability, decideSurfaceAccess } from '@/lib/entitlements/decide';
import { resolveCanonicalPlan } from '@/lib/entitlements/plan';
import type { EntitlementActor, SurfaceAccessInput } from '@/lib/entitlements/types';

const NOW = new Date('2026-09-28T12:00:00.000Z');
const TZ = 'Africa/Accra';

function user(role = 'OWNER', active = true, businessId = 'biz-1'): EntitlementActor {
  return { kind: 'USER', userId: 'user-1', businessId, role, active };
}

function system(
  job: 'OWNER_DAILY_SUMMARY_ENQUEUE' | 'OWNER_DAILY_SUMMARY_DISPATCH' = 'OWNER_DAILY_SUMMARY_ENQUEUE',
  invocationId = 'run-1',
): EntitlementActor {
  return { kind: 'SYSTEM', authenticatedJob: job, invocationId };
}

function business(overrides: Partial<SurfaceAccessInput['business']> = {}): SurfaceAccessInput['business'] {
  return {
    id: 'biz-1',
    plan: 'GROWTH',
    mode: null,
    storeMode: 'SINGLE_STORE',
    addonOnlineStorefront: false,
    isDemo: false,
    billing: 'PAID_ACTIVE',
    ...overrides,
  };
}

function decide(overrides: Partial<SurfaceAccessInput> = {}) {
  const actor = Object.prototype.hasOwnProperty.call(overrides, 'actor') ? overrides.actor ?? null : user();
  return decideSurfaceAccess({
    surfaceId: overrides.surfaceId ?? 'reports_hub',
    action: overrides.action ?? 'VIEW',
    trigger: overrides.trigger,
    actor,
    business: overrides.business ?? business(),
    scope: overrides.scope ?? {
      ownedStoreIds: ['store-1', 'store-2'],
      operationalStoreId: 'store-1',
      subjectBusinessId: 'biz-1',
    },
    range: overrides.range,
    delivery: overrides.delivery,
    now: overrides.now ?? NOW,
    timezone: overrides.timezone ?? TZ,
  });
}

function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function readyDelivery(overrides: Partial<NonNullable<SurfaceAccessInput['delivery']>> = {}) {
  return {
    enabled: true,
    recipientStatus: 'VERIFIED' as const,
    consentActive: true,
    verified: true,
    suppressed: false,
    rateLimited: false,
    ...overrides,
  };
}

describe('canonical plan resolution', () => {
  it('uses plan before mode and ignores legacy mode when plan is set', () => {
    expect(resolveCanonicalPlan({ plan: 'STARTER', mode: 'ADVANCED', storeMode: 'MULTI_STORE' })).toBe('STARTER');
  });

  it('maps a missing plan through the existing legacy mode rules', () => {
    expect(resolveCanonicalPlan({ plan: null, mode: 'ADVANCED', storeMode: 'MULTI_STORE' })).toBe('PRO');
    expect(resolveCanonicalPlan({ plan: null, mode: 'ADVANCED', storeMode: 'SINGLE_STORE' })).toBe('GROWTH');
    expect(resolveCanonicalPlan({ plan: null, mode: null, storeMode: null })).toBe('STARTER');
  });

  it('does not read selectedPlan in the decision plan source', () => {
    const planSource = stripComments(readFileSync('lib/entitlements/plan.ts', 'utf8'));
    const decisionSource = stripComments(readFileSync('lib/entitlements/decide.ts', 'utf8'));
    expect(planSource).not.toContain('selectedPlan');
    expect(decisionSource).not.toContain('selectedPlan');
  });
});

describe('decideSurfaceAccess precedence', () => {
  const pairs: Array<{ name: string; reason: string; run: () => ReturnType<typeof decide> }> = [
    {
      name: '1 before 2: missing actor is UNAUTHENTICATED',
      reason: 'UNAUTHENTICATED',
      run: () => decide({ actor: null, business: business({ billing: 'CANCELLED' }) }),
    },
    {
      name: '2 before 3: inactive unknown role is USER_INACTIVE',
      reason: 'USER_INACTIVE',
      run: () => decide({ actor: user('CLERK', false) }),
    },
    {
      name: '3 before 4: unknown role on an unknown surface is ROLE_UNKNOWN',
      reason: 'ROLE_UNKNOWN',
      run: () => decide({ actor: user('CLERK'), surfaceId: 'not-a-surface' }),
    },
    {
      name: '4 before 5: unknown surface wins over a tenant mismatch',
      reason: 'CATALOGUE_UNKNOWN',
      run: () =>
        decide({
          surfaceId: 'not-a-surface',
          actor: user('OWNER', true, 'other-biz'),
        }),
    },
    {
      name: '5 before 6: tenant mismatch wins over cancelled billing',
      reason: 'SCOPE_TENANT_MISMATCH',
      run: () =>
        decide({
          actor: user('OWNER', true, 'other-biz'),
          business: business({ billing: 'CANCELLED' }),
        }),
    },
    {
      name: '6 before 7: cancelled cashier is BILLING_CANCELLED',
      reason: 'BILLING_CANCELLED',
      run: () => decide({ actor: user('CASHIER'), business: business({ billing: 'CANCELLED' }) }),
    },
    {
      name: '7 before 8: cashier below the plan minimum is ROLE_FORBIDDEN',
      reason: 'ROLE_FORBIDDEN',
      run: () =>
        decide({
          surfaceId: 'sales_analytics',
          actor: user('CASHIER'),
          business: business({ plan: 'STARTER' }),
        }),
    },
    {
      name: '8 before 9: Starter storefront is PLAN_BELOW_MINIMUM',
      reason: 'PLAN_BELOW_MINIMUM',
      run: () =>
        decide({
          surfaceId: 'storefront_analytics',
          business: business({ plan: 'STARTER', addonOnlineStorefront: false }),
        }),
    },
    {
      name: '9 before 10: missing storefront add-on is ADDON_REQUIRED',
      reason: 'ADDON_REQUIRED',
      run: () =>
        decide({
          surfaceId: 'storefront_analytics',
          business: business({ plan: 'GROWTH', addonOnlineStorefront: false, isDemo: true }),
        }),
    },
    {
      name: '10 before 11: demo configuration is BUSINESS_DEMO while restricted',
      reason: 'BUSINESS_DEMO',
      run: () =>
        decide({
          surfaceId: 'notification_settings',
          action: 'CONFIGURE_DELIVERY',
          business: business({ isDemo: true, billing: 'TRIAL_RESTRICTED' }),
        }),
    },
    {
      name: '11 before 12: restricted export is BILLING_RESTRICTED before an invalid store',
      reason: 'BILLING_RESTRICTED',
      run: () =>
        decide({
          surfaceId: 'export_sales',
          action: 'EXPORT',
          business: business({ billing: 'PAYMENT_RESTRICTED' }),
          scope: { ownedStoreIds: ['store-1'], operationalStoreId: 'store-1', requestedStoreId: 'foreign' },
        }),
    },
    {
      name: '12 before 13: a foreign operational store is SCOPE_STORE_INVALID before ALL is considered',
      reason: 'SCOPE_STORE_INVALID',
      run: () =>
        decide({
          surfaceId: 'trading_report',
          scope: {
            ownedStoreIds: ['store-1'],
            operationalStoreId: 'foreign',
            requestedStoreId: 'ALL',
          },
        }),
    },
    {
      name: '13 before 14: Growth ALL is SCOPE_CONSOLIDATED_FORBIDDEN',
      reason: 'SCOPE_CONSOLIDATED_FORBIDDEN',
      run: () =>
        decide({
          surfaceId: 'trading_report',
          scope: {
            ownedStoreIds: ['store-1', 'store-2'],
            operationalStoreId: 'store-1',
            requestedStoreId: 'ALL',
          },
        }),
    },
    {
      name: '14 before 15: an owned non-operational store is SCOPE_STORE_NOT_OPERATIONAL',
      reason: 'SCOPE_STORE_NOT_OPERATIONAL',
      run: () =>
        decide({
          surfaceId: 'trading_report',
          scope: {
            ownedStoreIds: ['store-1', 'store-2'],
            operationalStoreId: null,
            requestedStoreId: 'store-2',
          },
        }),
    },
    {
      name: '15 before 16: an unselected store wins over a range denial',
      reason: 'SCOPE_STORE_UNSELECTED',
      run: () =>
        decide({
          surfaceId: 'business_movement',
          scope: { ownedStoreIds: ['store-1', 'store-2'], operationalStoreId: null },
          range: { fromLocalDate: '2020-01-01', toLocalDate: '2026-09-28', preset: 'CUSTOM' },
        }),
    },
    {
      name: '16 before 17: a capped export range denial is not replaced by delivery flags',
      reason: 'RANGE_EXCEEDS_PLAN',
      run: () =>
        decide({
          surfaceId: 'export_business_movement',
          action: 'EXPORT',
          range: { fromLocalDate: '2020-01-01', toLocalDate: '2026-09-28', preset: 'CUSTOM' },
          delivery: readyDelivery({ enabled: false, rateLimited: true }),
        }),
    },
    {
      name: '17 before 18: disabled delivery wins over missing consent',
      reason: 'DELIVERY_DISABLED',
      run: () =>
        decide({
          surfaceId: 'owner_daily_summary',
          action: 'SEND_DELIVERY',
          trigger: 'SCHEDULED',
          actor: system(),
          delivery: readyDelivery({ enabled: false, consentActive: false, verified: false }),
        }),
    },
    {
      name: '18 before 19: missing consent wins over an unverified destination',
      reason: 'CONSENT_MISSING',
      run: () =>
        decide({
          surfaceId: 'owner_daily_summary',
          action: 'SEND_DELIVERY',
          trigger: 'SCHEDULED',
          actor: system(),
          delivery: readyDelivery({ consentActive: false, verified: false, recipientStatus: 'PENDING_VERIFICATION' }),
        }),
    },
    {
      name: '19 before 20: unverified destination wins over suppression',
      reason: 'DESTINATION_UNVERIFIED',
      run: () =>
        decide({
          surfaceId: 'owner_daily_summary',
          action: 'SEND_DELIVERY',
          trigger: 'SCHEDULED',
          actor: system(),
          delivery: readyDelivery({
            verified: false,
            recipientStatus: 'PENDING_VERIFICATION',
            suppressed: true,
          }),
        }),
    },
    {
      name: '20 before 21: suppression does not emit RECIPIENT_OPTED_OUT; rate limit is next',
      reason: 'DELIVERY_RATE_LIMITED',
      run: () =>
        decide({
          surfaceId: 'owner_daily_summary',
          action: 'SEND_DELIVERY',
          trigger: 'SCHEDULED',
          actor: system(),
          delivery: readyDelivery({ suppressed: true, rateLimited: true, retryAfterSeconds: 30 }),
        }),
    },
  ];

  it.each(pairs)('$name', ({ reason, run }) => {
    const decision = run();
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe(reason);
  });
});

describe('decideSurfaceAccess contract fixtures', () => {
  it('returns CATALOGUE_UNKNOWN for OPERATIONAL_WRITE and for the removed WhatsApp surface', () => {
    expect(decide({ action: 'OPERATIONAL_WRITE' }).ok).toBe(false);
    expect(decide({ action: 'OPERATIONAL_WRITE' })).toMatchObject({ reason: 'CATALOGUE_UNKNOWN' });
    expect(decide({ surfaceId: 'owner_daily_summary_whatsapp_legacy', action: 'SEND_DELIVERY' })).toMatchObject({
      reason: 'CATALOGUE_UNKNOWN',
    });
  });

  it('fails closed when evaluation throws', () => {
    const ownedStoreIds = new Proxy([] as string[], {
      get() {
        throw new Error('catalogue read failed');
      },
    });
    expect(() =>
      decide({
        surfaceId: 'trading_report',
        scope: { ownedStoreIds, operationalStoreId: null },
      }),
    ).not.toThrow();
    expect(
      decide({
        surfaceId: 'trading_report',
        scope: { ownedStoreIds, operationalStoreId: null },
      }),
    ).toMatchObject({ ok: false, reason: 'CATALOGUE_UNKNOWN' });
  });

  it('keeps restricted report view read-only and blocks exports', () => {
    const view = decide({ business: business({ billing: 'READ_ONLY' }) });
    expect(view).toMatchObject({ ok: true, readOnly: true });
    expect(decide({ surfaceId: 'export_sales', action: 'EXPORT', business: business({ billing: 'TRIAL_RESTRICTED' }) })).toMatchObject({
      reason: 'BILLING_RESTRICTED',
    });
  });

  it('allows disable and masked notification view in cancelled billing, and blocks preview', () => {
    expect(
      decide({
        surfaceId: 'notification_settings',
        action: 'DISABLE_DELIVERY',
        business: business({ billing: 'CANCELLED' }),
      }),
    ).toMatchObject({ ok: true });
    expect(
      decide({
        surfaceId: 'notification_settings',
        action: 'VIEW',
        business: business({ billing: 'CANCELLED' }),
      }),
    ).toMatchObject({ ok: true, destinationMask: true });
    expect(
      decide({
        surfaceId: 'notification_settings',
        action: 'PREVIEW_DELIVERY',
        business: business({ billing: 'CANCELLED' }),
      }),
    ).toMatchObject({ reason: 'BILLING_CANCELLED' });
    expect(
      decide({
        surfaceId: 'notification_settings',
        action: 'CONFIGURE_DELIVERY',
        business: business({ billing: 'TRIAL_RESTRICTED' }),
      }),
    ).toMatchObject({ reason: 'BILLING_RESTRICTED' });
    expect(
      decide({
        surfaceId: 'notification_settings',
        action: 'PREVIEW_DELIVERY',
        business: business({ billing: 'PAYMENT_RESTRICTED' }),
      }),
    ).toMatchObject({ reason: 'BILLING_RESTRICTED' });
    expect(
      decide({
        surfaceId: 'notification_settings',
        action: 'DISABLE_DELIVERY',
        business: business({ billing: 'READ_ONLY' }),
      }),
    ).toMatchObject({ ok: true });
  });

  it('does not let a SYSTEM actor skip plan, billing or delivery checks', () => {
    expect(
      decide({
        surfaceId: 'owner_daily_summary',
        action: 'VIEW',
        actor: system(),
      }),
    ).toMatchObject({ reason: 'UNAUTHENTICATED' });
    expect(
      decide({
        surfaceId: 'owner_daily_summary',
        action: 'PREVIEW_DELIVERY',
        trigger: 'SCHEDULED',
        actor: system(),
      }),
    ).toMatchObject({ reason: 'UNAUTHENTICATED' });
    expect(
      decide({
        surfaceId: 'owner_daily_summary',
        action: 'SEND_DELIVERY',
        trigger: 'SCHEDULED',
        actor: system('OWNER_DAILY_SUMMARY_ENQUEUE', '   '),
      }),
    ).toMatchObject({ reason: 'UNAUTHENTICATED' });
    expect(
      decide({
        surfaceId: 'owner_daily_summary',
        action: 'SEND_DELIVERY',
        trigger: 'SCHEDULED',
        actor: system('OWNER_DAILY_SUMMARY_DISPATCH'),
      }),
    ).toMatchObject({ reason: 'UNAUTHENTICATED' });
    expect(
      decide({
        surfaceId: 'owner_daily_summary',
        action: 'SEND_DELIVERY',
        trigger: 'SCHEDULED',
        actor: system(),
        business: business({ plan: 'STARTER' }),
        delivery: readyDelivery(),
      }),
    ).toMatchObject({ reason: 'PLAN_BELOW_MINIMUM' });
    expect(
      decide({
        surfaceId: 'cron_eod_summary',
        action: 'SEND_DELIVERY',
        trigger: 'SCHEDULED',
        actor: system(),
        business: business({ billing: 'TRIAL_RESTRICTED' }),
        delivery: readyDelivery(),
      }),
    ).toMatchObject({ reason: 'BILLING_RESTRICTED' });
    const allowed = decide({
      surfaceId: 'cron_eod_summary',
      action: 'SEND_DELIVERY',
      trigger: 'SCHEDULED',
      actor: system(),
      delivery: readyDelivery(),
    });
    expect(allowed).toMatchObject({
      ok: true,
      scope: { class: 'STORE_DIMENSIONAL', mode: 'STORE', storeId: 'store-1' },
    });
  });

  it('rejects every non-send action and an empty invocation for SYSTEM actors', () => {
    for (const action of ['VIEW', 'EXPORT', 'CONFIGURE_DELIVERY', 'DISABLE_DELIVERY', 'PREVIEW_DELIVERY']) {
      expect(
        decide({
          surfaceId: 'notification_settings',
          action,
          trigger: 'SCHEDULED',
          actor: system(),
        }),
      ).toMatchObject({ reason: 'UNAUTHENTICATED' });
    }
    expect(
      decide({
        surfaceId: 'owner_daily_summary',
        action: 'SEND_DELIVERY',
        trigger: 'SCHEDULED',
        actor: system('OWNER_DAILY_SUMMARY_ENQUEUE', ''),
      }),
    ).toMatchObject({ reason: 'UNAUTHENTICATED' });
  });

  it('denies a user scheduled trigger and a dispatch job on the enqueue surface', () => {
    expect(decide({ trigger: 'SCHEDULED' })).toMatchObject({ reason: 'UNAUTHENTICATED' });
    expect(
      decide({
        surfaceId: 'cron_dispatch_outbox',
        action: 'SEND_DELIVERY',
        trigger: 'SCHEDULED',
        actor: system(),
      }),
    ).toMatchObject({ reason: 'UNAUTHENTICATED' });
    expect(
      decide({
        surfaceId: 'cron_dispatch_outbox',
        action: 'SEND_DELIVERY',
        trigger: 'SCHEDULED',
        actor: system('OWNER_DAILY_SUMMARY_DISPATCH'),
        delivery: readyDelivery(),
      }).ok,
    ).toBe(true);
  });

  it('resolves store scope from E.2 and E.3', () => {
    expect(
      decide({
        surfaceId: 'trading_report',
        business: business({ plan: 'PRO' }),
        scope: { ownedStoreIds: ['store-1', 'store-2'], operationalStoreId: 'store-1' },
      }),
    ).toMatchObject({ ok: true, scope: { mode: 'STORE', storeId: 'store-1' } });

    expect(
      decide({
        surfaceId: 'trading_report',
        business: business({ plan: 'PRO' }),
        scope: {
          ownedStoreIds: ['store-1', 'store-2'],
          operationalStoreId: 'store-1',
          requestedStoreId: 'ALL',
        },
      }),
    ).toMatchObject({ ok: true, scope: { mode: 'ALL' } });

    expect(
      decide({
        surfaceId: 'trading_report',
        business: business({ plan: 'PRO', storeMode: 'SINGLE_STORE' }),
        scope: { ownedStoreIds: ['store-1'], operationalStoreId: 'store-1', requestedStoreId: 'ALL' },
      }),
    ).toMatchObject({ ok: true, scope: { mode: 'STORE', storeId: 'store-1' } });

    expect(
      decide({
        surfaceId: 'drawer_drilldown',
        action: 'VIEW',
        actor: user('CASHIER'),
        business: business({ plan: 'PRO' }),
        scope: { ownedStoreIds: ['store-1', 'store-2'], operationalStoreId: 'store-1', requestedStoreId: 'ALL' },
      }),
    ).toMatchObject({ reason: 'SCOPE_CONSOLIDATED_FORBIDDEN' });

    expect(
      decide({
        surfaceId: 'trading_report',
        scope: { ownedStoreIds: ['store-1'], operationalStoreId: null },
      }),
    ).toMatchObject({ ok: true, scope: { mode: 'STORE', storeId: 'store-1' } });
  });

  it('rejects a supplied store on fixed, accounting and storefront surfaces', () => {
    expect(
      decide({
        surfaceId: 'owner_brief',
        business: business({ plan: 'PRO' }),
        scope: { requestedStoreId: 'ALL', ownedStoreIds: ['store-1'] },
      }),
    ).toMatchObject({ reason: 'SCOPE_STORE_INVALID' });
    expect(
      decide({
        surfaceId: 'cashflow_forecast',
        business: business({ plan: 'PRO' }),
        scope: { requestedStoreId: '', ownedStoreIds: [] },
      }),
    ).toMatchObject({ reason: 'SCOPE_STORE_INVALID' });
    expect(decide({ surfaceId: 'owner_brief', business: business({ plan: 'PRO' }), scope: {} })).toMatchObject({
      ok: true,
      scope: { class: 'FIXED_CONSOLIDATED', label: 'Consolidated — all branches' },
    });
    expect(
      decide({
        surfaceId: 'income_statement',
        scope: { requestedStoreId: 'store-1' },
        range: { fromLocalDate: '2026-09-01', toLocalDate: '2026-09-28', preset: 'MONTH_TO_DATE' },
      }),
    ).toMatchObject({ reason: 'SCOPE_STORE_INVALID' });
    expect(
      decide({
        surfaceId: 'income_statement',
        scope: {},
        range: { fromLocalDate: '2026-09-01', toLocalDate: '2026-09-28', preset: 'MONTH_TO_DATE' },
      }),
    ).toMatchObject({
      ok: true,
      scope: { class: 'ACCOUNTING_WHOLE_BUSINESS', label: 'Whole business — not separated by branch' },
    });
    expect(
      decide({
        surfaceId: 'storefront_analytics',
        business: business({ addonOnlineStorefront: true }),
        scope: { requestedStoreId: 'store-1', ownedStoreIds: ['store-1'] },
      }),
    ).toMatchObject({ reason: 'SCOPE_STORE_INVALID' });
    expect(
      decide({
        surfaceId: 'storefront_analytics',
        business: business({ plan: 'PRO', addonOnlineStorefront: false }),
        scope: {},
        range: { fromLocalDate: '2026-09-01', toLocalDate: '2026-09-28', preset: 'CUSTOM' },
      }),
    ).toMatchObject({ ok: true, scope: { class: 'STOREFRONT_DOMAIN', label: 'Online storefront' } });
  });

  it('limits sale detail for another cashier and a foreign tenant', () => {
    expect(
      decide({
        surfaceId: 'sale_detail',
        actor: user('CASHIER'),
        scope: { recordOwnerUserId: 'someone-else', recordStoreId: 'store-1', ownedStoreIds: ['store-1'] },
      }),
    ).toMatchObject({ reason: 'SCOPE_TENANT_MISMATCH' });
    expect(
      decide({
        surfaceId: 'sale_detail',
        actor: user('CASHIER'),
        scope: { recordOwnerUserId: 'user-1', recordStoreId: 'store-1', ownedStoreIds: ['store-1'] },
      }),
    ).toMatchObject({ ok: true, scope: { class: 'TENANT_RECORD', storeId: 'store-1' } });
    expect(
      decide({
        surfaceId: 'customer_statement',
        action: 'EXPORT',
        scope: { subjectBusinessId: 'other', ownedStoreIds: ['store-1'], operationalStoreId: 'store-1' },
      }),
    ).toMatchObject({ reason: 'SCOPE_TENANT_MISMATCH' });
  });

  it('denies demo sends and configuration and still allows disable', () => {
    expect(
      decide({
        surfaceId: 'notification_settings',
        action: 'SEND_DELIVERY',
        trigger: 'MANUAL_TEST',
        business: business({ isDemo: true }),
        delivery: readyDelivery(),
      }),
    ).toMatchObject({ reason: 'BUSINESS_DEMO' });
    expect(
      decide({
        surfaceId: 'notification_settings',
        action: 'DISABLE_DELIVERY',
        business: business({ isDemo: true, billing: 'READ_ONLY' }),
      }),
    ).toMatchObject({ ok: true });
  });

  it('denies managers on owner-only Pro surfaces', () => {
    expect(
      decide({
        surfaceId: 'export_owner_brief',
        action: 'EXPORT',
        actor: user('MANAGER'),
        business: business({ plan: 'PRO' }),
      }),
    ).toMatchObject({ reason: 'ROLE_FORBIDDEN' });
    expect(
      decide({
        surfaceId: 'audit_log',
        actor: user('MANAGER'),
        business: business({ plan: 'PRO' }),
      }),
    ).toMatchObject({ reason: 'ROLE_FORBIDDEN' });
  });

  it('entitles legacy mode ADVANCED + MULTI_STORE as Pro inside the decision', () => {
    expect(
      decide({
        surfaceId: 'owner_brief',
        business: business({ plan: null, mode: 'ADVANCED', storeMode: 'MULTI_STORE' }),
        scope: {},
      }).ok,
    ).toBe(true);
    expect(
      decide({
        surfaceId: 'owner_brief',
        business: business({ plan: 'STARTER', mode: 'ADVANCED', storeMode: 'MULTI_STORE' }),
        scope: {},
      }),
    ).toMatchObject({ reason: 'PLAN_BELOW_MINIMUM' });
  });
});

describe('decideBusinessCapability', () => {
  const base = {
    actor: user(),
    business: { id: 'biz-1', billing: 'PAID_ACTIVE', canWrite: true },
    capability: 'OPERATIONAL_WRITE',
  };

  it('allows an active user when canWrite is true, including the internal-QA bypass flag', () => {
    expect(decideBusinessCapability(base)).toEqual({ ok: true });
    expect(
      decideBusinessCapability({
        ...base,
        actor: user('CASHIER'),
        business: { id: 'biz-1', billing: 'TRIAL_RESTRICTED', canWrite: true },
      }),
    ).toEqual({ ok: true });
  });

  it('denies system, inactive, unknown, mismatched and locked businesses', () => {
    expect(decideBusinessCapability({ ...base, actor: system() })).toEqual({ ok: false, reason: 'UNAUTHENTICATED' });
    expect(decideBusinessCapability({ ...base, actor: null })).toEqual({ ok: false, reason: 'UNAUTHENTICATED' });
    expect(decideBusinessCapability({ ...base, actor: user('OWNER', false) })).toEqual({
      ok: false,
      reason: 'USER_INACTIVE',
    });
    expect(decideBusinessCapability({ ...base, actor: user('CLERK') })).toEqual({ ok: false, reason: 'ROLE_UNKNOWN' });
    expect(decideBusinessCapability({ ...base, actor: user('OWNER', true, 'other') })).toEqual({
      ok: false,
      reason: 'SCOPE_TENANT_MISMATCH',
    });
    expect(decideBusinessCapability({ ...base, capability: 'SEND_DELIVERY' })).toEqual({
      ok: false,
      reason: 'CATALOGUE_UNKNOWN',
    });
    expect(
      decideBusinessCapability({
        ...base,
        business: { id: 'biz-1', billing: 'READ_ONLY', canWrite: false },
      }),
    ).toEqual({ ok: false, reason: 'BILLING_RESTRICTED' });
    expect(
      decideBusinessCapability({
        ...base,
        business: { id: 'biz-1', billing: 'CANCELLED', canWrite: false },
      }),
    ).toEqual({ ok: false, reason: 'BILLING_CANCELLED' });
  });
});

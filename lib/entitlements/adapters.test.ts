import { describe, expect, it } from 'vitest';
import { authorizeCronSurface, guardSurfaceRoute, requireSurface, withSurfaceAction } from '@/lib/entitlements/adapters';
import type { EntitlementActor } from '@/lib/entitlements/types';
import { DENIAL_REASONS, DENIAL_ROUTE_STATUS } from '@/lib/entitlements/types';
import type { SurfaceAccessInput } from '@/lib/entitlements/types';

const input: SurfaceAccessInput = {
  surfaceId: 'export_sales',
  action: 'EXPORT',
  actor: { kind: 'USER', userId: 'user-1', businessId: 'biz-1', role: 'OWNER', active: true },
  business: {
    id: 'biz-1',
    plan: 'GROWTH',
    mode: null,
    storeMode: 'SINGLE_STORE',
    addonOnlineStorefront: false,
    isDemo: false,
    billing: 'PAID_ACTIVE',
  },
  scope: { ownedStoreIds: ['store-1'], operationalStoreId: 'store-1' },
  now: new Date('2026-09-28T12:00:00.000Z'),
  timezone: 'Africa/Accra',
};

describe('entitlement adapters', () => {
  it('maps every denial reason to the B.6 route status', () => {
    expect(DENIAL_REASONS).toHaveLength(21);
    expect(DENIAL_ROUTE_STATUS).toEqual({
      UNAUTHENTICATED: 401,
      USER_INACTIVE: 403,
      ROLE_UNKNOWN: 403,
      CATALOGUE_UNKNOWN: 404,
      SCOPE_TENANT_MISMATCH: 403,
      BILLING_CANCELLED: 403,
      ROLE_FORBIDDEN: 403,
      PLAN_BELOW_MINIMUM: 403,
      ADDON_REQUIRED: 403,
      BUSINESS_DEMO: 403,
      BILLING_RESTRICTED: 403,
      SCOPE_STORE_INVALID: 404,
      SCOPE_CONSOLIDATED_FORBIDDEN: 403,
      SCOPE_STORE_NOT_OPERATIONAL: 403,
      SCOPE_STORE_UNSELECTED: 400,
      RANGE_EXCEEDS_PLAN: 403,
      DELIVERY_DISABLED: 403,
      CONSENT_MISSING: 403,
      DESTINATION_UNVERIFIED: 403,
      RECIPIENT_OPTED_OUT: 403,
      DELIVERY_RATE_LIMITED: 429,
    });
  });

  it('returns no-store JSON for a route guard and a reason for an action', () => {
    const allowed = guardSurfaceRoute(input);
    expect(allowed.status).toBe(200);
    expect(allowed.headers['Cache-Control']).toBe('no-store');
    expect(allowed.body).toMatchObject({ ok: true, surfaceId: 'export_sales' });

    const denied = guardSurfaceRoute({ ...input, actor: null });
    expect(denied.status).toBe(401);
    expect(denied.headers['Cache-Control']).toBe('no-store');
    expect(denied.body).toMatchObject({ ok: false, reason: 'UNAUTHENTICATED', surfaceId: 'export_sales' });

    expect(
      withSurfaceAction({
        ...input,
        actor: { kind: 'USER', userId: 'user-1', businessId: 'biz-1', role: 'OWNER', active: false },
      }),
    ).toEqual({
      ok: false,
      reason: 'USER_INACTIVE',
    });
  });

  it('redirects inactive users to login and locked plans to a notice', () => {
    expect(requireSurface({ ...input, actor: null })).toMatchObject({ outcome: 'redirect', href: '/login' });
    expect(
      requireSurface({
        ...input,
        surfaceId: 'sales_analytics',
        action: 'VIEW',
        business: { ...input.business, plan: 'STARTER' },
      }),
    ).toMatchObject({ outcome: 'notice', notice: 'plan', reason: 'PLAN_BELOW_MINIMUM' });
    expect(
      requireSurface({
        ...input,
        actor: { kind: 'USER', userId: 'user-1', businessId: 'biz-1', role: 'CASHIER', active: true },
      }),
    ).toMatchObject({
      outcome: 'redirect',
      href: '/pos',
      reason: 'ROLE_FORBIDDEN',
    });
  });

  it('does not recommend an upgrade or expose plan prices on a role or cashier denial', () => {
    const roleDenied = requireSurface({
      ...input,
      surfaceId: 'reports_hub',
      action: 'VIEW',
      actor: { kind: 'USER', userId: 'user-1', businessId: 'biz-1', role: 'CASHIER', active: true },
    });
    expect(roleDenied).toEqual({ outcome: 'redirect', href: '/pos', reason: 'ROLE_FORBIDDEN' });
    expect(JSON.stringify(roleDenied)).not.toMatch(/upgrade|GHS|GH₵|199|349|699/i);

    const cashierPlan = requireSurface({
      ...input,
      surfaceId: 'product_labels',
      action: 'VIEW',
      actor: { kind: 'USER', userId: 'user-1', businessId: 'biz-1', role: 'CASHIER', active: true },
      business: { ...input.business, plan: 'STARTER' },
    });
    expect(cashierPlan).toMatchObject({ outcome: 'notice', notice: 'pos-lock', reason: 'PLAN_BELOW_MINIMUM' });
    expect(JSON.stringify(cashierPlan)).not.toMatch(/upgrade|GHS|GH₵|199|349|699/i);

    const ownerPlan = requireSurface({
      ...input,
      surfaceId: 'sales_analytics',
      action: 'VIEW',
      business: { ...input.business, plan: 'STARTER' },
    });
    expect(ownerPlan).toMatchObject({ outcome: 'notice', notice: 'plan', reason: 'PLAN_BELOW_MINIMUM' });
    expect(JSON.stringify(ownerPlan)).not.toMatch(/GHS|GH₵|199|349|699/);
  });

  it('rejects a SYSTEM actor presented to a page, route or server action', () => {
    const systemActor: EntitlementActor = {
      kind: 'SYSTEM',
      authenticatedJob: 'OWNER_DAILY_SUMMARY_ENQUEUE',
      invocationId: 'run-1',
    };
    const presented = {
      ...input,
      surfaceId: 'cron_eod_summary',
      action: 'SEND_DELIVERY' as const,
      trigger: 'SCHEDULED' as const,
      actor: systemActor,
      scope: { ...input.scope, subjectBusinessId: 'biz-1' },
      delivery: {
        enabled: true,
        recipientStatus: 'VERIFIED' as const,
        consentActive: true,
        verified: true,
        suppressed: false,
        rateLimited: false,
      },
    };
    expect(requireSurface(presented)).toMatchObject({ outcome: 'redirect', href: '/login', reason: 'UNAUTHENTICATED' });
    expect(guardSurfaceRoute(presented).body).toMatchObject({ ok: false, reason: 'UNAUTHENTICATED' });
    expect(withSurfaceAction(presented)).toEqual({ ok: false, reason: 'UNAUTHENTICATED' });
  });

  it('builds a SYSTEM actor only after the cron secret matches', () => {
    const headers = new Headers({ authorization: 'Bearer wrong' });
    const denied = authorizeCronSurface(
      { headers },
      {
        ...input,
        surfaceId: 'cron_eod_summary',
        job: 'OWNER_DAILY_SUMMARY_ENQUEUE',
        invocationId: 'run-1',
        scope: { ...input.scope, subjectBusinessId: 'biz-1' },
        delivery: {
          enabled: true,
          recipientStatus: 'VERIFIED',
          consentActive: true,
          verified: true,
          suppressed: false,
          rateLimited: false,
        },
      },
      'expected-secret',
    );
    expect(denied).toMatchObject({ ok: false, reason: 'UNAUTHENTICATED' });

    const allowed = authorizeCronSurface(
      { headers: new Headers({ authorization: 'Bearer expected-secret' }) },
      {
        ...input,
        surfaceId: 'cron_eod_summary',
        job: 'OWNER_DAILY_SUMMARY_ENQUEUE',
        invocationId: 'run-1',
        scope: { ...input.scope, subjectBusinessId: 'biz-1' },
        delivery: {
          enabled: true,
          recipientStatus: 'VERIFIED',
          consentActive: true,
          verified: true,
          suppressed: false,
          rateLimited: false,
        },
      },
      'expected-secret',
    );
    expect(allowed.ok).toBe(true);
  });
});

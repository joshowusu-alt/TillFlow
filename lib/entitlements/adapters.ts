import { hasValidCronSecret } from '@/lib/cron-auth';
import { decideSurfaceAccess } from '@/lib/entitlements/decide';
import {
  DENIAL_ROUTE_STATUS,
  type AllowDecision,
  type AuthenticatedJob,
  type Decision,
  type DenialReason,
  type EntitlementActor,
  type SurfaceAccessInput,
} from '@/lib/entitlements/types';

/**
 * Thin mappings from a decision to the B.6 page, route and action results.
 * They contain no entitlement rules. Stage 1 does not mount them on routes.
 * Session loading stays with the existing `requireUser` until a later stage.
 */

export type PageNotice =
  | 'plan'
  | 'addon'
  | 'pos-lock'
  | 'demo'
  | 'range'
  | 'branch'
  | 'select-branch'
  | 'consolidated'
  | 'billing-restricted'
  | 'delivery';

export type PageAccessResult =
  | { outcome: 'allow'; decision: AllowDecision }
  | { outcome: 'redirect'; href: '/login' | '/pos' | '/settings/billing'; reason: DenialReason }
  | { outcome: 'notFound'; reason: DenialReason }
  | {
      outcome: 'notice';
      reason: DenialReason;
      notice: PageNotice;
      clampHref?: string;
      retryAfterSeconds?: number;
      readOnlyBanner?: boolean;
    };

export type RouteAccessResult = {
  status: number;
  headers: { 'Cache-Control': 'no-store' };
  body:
    | {
        ok: false;
        reason: DenialReason;
        surfaceId: string;
        clampHref?: string;
        retryAfterSeconds?: number;
      }
    | {
        ok: true;
        surfaceId: string;
        scope: AllowDecision['scope'];
        readOnly?: boolean;
        destinationMask?: boolean;
        appliedRange?: AllowDecision['appliedRange'];
      };
};

export type ActionAccessResult =
  | { ok: true; decision: AllowDecision }
  | { ok: false; reason: DenialReason; clampHref?: string; retryAfterSeconds?: number };

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function requireSurface(input: SurfaceAccessInput): PageAccessResult {
  const userInput = presentedByUserAdapter(input);
  return toPageAccess(decideSurfaceAccess(userInput), userInput.action, userInput.actor);
}

export function guardSurfaceRoute(input: SurfaceAccessInput): RouteAccessResult {
  const userInput = presentedByUserAdapter(input);
  return toRouteAccess(decideSurfaceAccess(userInput), userInput.surfaceId);
}

export function withSurfaceAction(input: SurfaceAccessInput): ActionAccessResult {
  const decision = decideSurfaceAccess(presentedByUserAdapter(input));
  if (decision.ok) return { ok: true, decision };
  return {
    ok: false,
    reason: decision.reason,
    ...(decision.clampHref ? { clampHref: decision.clampHref } : {}),
    ...(decision.retryAfterSeconds !== undefined ? { retryAfterSeconds: decision.retryAfterSeconds } : {}),
  };
}

export function toPageAccess(decision: Decision, action: string, actor?: EntitlementActor | null): PageAccessResult {
  if (decision.ok) return { outcome: 'allow', decision };

  const reason = decision.reason;
  if (reason === 'UNAUTHENTICATED' || reason === 'USER_INACTIVE' || reason === 'ROLE_UNKNOWN') {
    return { outcome: 'redirect', href: '/login', reason };
  }
  if (reason === 'BILLING_CANCELLED') {
    return { outcome: 'redirect', href: '/settings/billing', reason };
  }
  if (reason === 'ROLE_FORBIDDEN') {
    return { outcome: 'redirect', href: '/pos', reason };
  }
  if (reason === 'CATALOGUE_UNKNOWN' || reason === 'SCOPE_TENANT_MISMATCH' || reason === 'SCOPE_STORE_INVALID') {
    return { outcome: 'notFound', reason };
  }

  return {
    outcome: 'notice',
    reason,
    notice: pageNoticeFor(reason, actor),
    ...(reason === 'BILLING_RESTRICTED' && action === 'VIEW' ? { readOnlyBanner: true as const } : {}),
    ...(decision.clampHref ? { clampHref: decision.clampHref } : {}),
    ...(decision.retryAfterSeconds !== undefined ? { retryAfterSeconds: decision.retryAfterSeconds } : {}),
  };
}

/**
 * A cashier who is allowed on the surface but is below the plan sees a POS lock.
 * That result carries no upgrade recommendation and no plan price.
 * Owner and manager plan denials use the plan or add-on notice, still without prices.
 */
function pageNoticeFor(reason: DenialReason, actor?: EntitlementActor | null): PageNotice {
  const cashier =
    actor?.kind === 'USER' && actor.role === 'CASHIER' && (reason === 'PLAN_BELOW_MINIMUM' || reason === 'ADDON_REQUIRED');
  if (cashier) return 'pos-lock';
  return noticeFor(reason);
}

function noticeFor(reason: DenialReason): PageNotice {
  switch (reason) {
    case 'PLAN_BELOW_MINIMUM':
      return 'plan';
    case 'ADDON_REQUIRED':
      return 'addon';
    case 'BUSINESS_DEMO':
      return 'demo';
    case 'RANGE_EXCEEDS_PLAN':
      return 'range';
    case 'SCOPE_STORE_NOT_OPERATIONAL':
      return 'branch';
    case 'SCOPE_STORE_UNSELECTED':
      return 'select-branch';
    case 'SCOPE_CONSOLIDATED_FORBIDDEN':
      return 'consolidated';
    case 'BILLING_RESTRICTED':
      return 'billing-restricted';
    default:
      return 'delivery';
  }
}

export function toRouteAccess(decision: Decision, surfaceId: string): RouteAccessResult {
  if (!decision.ok) {
    return {
      status: DENIAL_ROUTE_STATUS[decision.reason],
      headers: NO_STORE,
      body: {
        ok: false,
        reason: decision.reason,
        surfaceId,
        ...(decision.clampHref ? { clampHref: decision.clampHref } : {}),
        ...(decision.retryAfterSeconds !== undefined ? { retryAfterSeconds: decision.retryAfterSeconds } : {}),
      },
    };
  }

  return {
    status: 200,
    headers: NO_STORE,
    body: {
      ok: true,
      surfaceId,
      scope: decision.scope,
      ...(decision.readOnly ? { readOnly: true as const } : {}),
      ...(decision.destinationMask ? { destinationMask: true as const } : {}),
      ...(decision.appliedRange ? { appliedRange: decision.appliedRange } : {}),
    },
  };
}

/** Pages, route handlers and server actions cannot present a SYSTEM actor. */
function presentedByUserAdapter(input: SurfaceAccessInput): SurfaceAccessInput {
  if (input.actor?.kind === 'SYSTEM') {
    return { ...input, actor: null };
  }
  return input;
}

type CronRequest = {
  headers: { get(name: string): string | null };
};

/**
 * Verifies the cron secret, then calls `decideSurfaceAccess` with a SYSTEM
 * actor. A missing secret calls the same function with no actor, so there is
 * no second allow path. This adapter is not mounted on the cron routes.
 */
export function authorizeCronSurface(
  request: CronRequest,
  input: Omit<SurfaceAccessInput, 'actor' | 'action' | 'trigger'> & {
    job: AuthenticatedJob;
    invocationId: string;
    surfaceId: string;
  },
  expectedSecret?: string,
): Decision {
  const secretValid = hasValidCronSecret(request, expectedSecret);
  return decideSurfaceAccess({
    surfaceId: input.surfaceId,
    action: 'SEND_DELIVERY',
    trigger: 'SCHEDULED',
    actor: secretValid
      ? {
          kind: 'SYSTEM',
          authenticatedJob: input.job,
          invocationId: input.invocationId,
        }
      : null,
    business: input.business,
    scope: input.scope,
    range: input.range,
    delivery: input.delivery,
    now: input.now,
    timezone: input.timezone,
  });
}

import { getFeatures, hasPlanAccess } from '@/lib/features';
import { SURFACE_CATALOGUE, type SurfaceId } from '@/lib/entitlements/surface-catalogue';
import { resolveCanonicalPlan } from '@/lib/entitlements/plan';
import { resolveSurfaceScope } from '@/lib/entitlements/scope';
import { resolveAnalyticalRange, todayLocalDate } from '@/lib/entitlements/range';
import {
  BILLING_CLASS,
  BUSINESS_CAPABILITY,
  ROLES,
  SURFACE_ACTIONS,
  type AllowDecision,
  type AuthenticatedJob,
  type BusinessCapabilityInput,
  type CapabilityDecision,
  type Decision,
  type DenialReason,
  type DenyDecision,
  type SurfaceAccessInput,
  type SurfaceAction,
  type SurfaceSpec,
} from '@/lib/entitlements/types';

/**
 * Pure entitlement decisions. Evaluation order is B.6.
 * Adapters must not allow when this function denies, and must not skip it.
 */

const KNOWN_ROLES = new Set<string>(ROLES);

const SYSTEM_SURFACES: Record<AuthenticatedJob, readonly string[]> = {
  OWNER_DAILY_SUMMARY_ENQUEUE: ['cron_eod_summary', 'owner_daily_summary'],
  OWNER_DAILY_SUMMARY_DISPATCH: ['cron_dispatch_outbox'],
};

const DEMO_DENIED_ACTIONS = new Set<string>(['SEND_DELIVERY', 'CONFIGURE_DELIVERY']);

function deny(reason: DenialReason, extra?: Pick<DenyDecision, 'clampHref' | 'retryAfterSeconds'>): DenyDecision {
  const decision: DenyDecision = { ok: false, reason };
  if (extra?.clampHref) decision.clampHref = extra.clampHref;
  if (extra?.retryAfterSeconds !== undefined) decision.retryAfterSeconds = extra.retryAfterSeconds;
  return decision;
}

function isSurfaceAction(action: string): action is SurfaceAction {
  return SURFACE_ACTIONS.some((candidate) => candidate === action);
}

function roleIsListed(roles: readonly string[], role: string): boolean {
  return roles.some((candidate) => candidate === role);
}

function isCatalogueId(surfaceId: string): surfaceId is SurfaceId {
  return Object.prototype.hasOwnProperty.call(SURFACE_CATALOGUE, surfaceId);
}

export function decideSurfaceAccess(input: SurfaceAccessInput): Decision {
  try {
    return evaluateSurfaceAccess(input);
  } catch {
    return deny('CATALOGUE_UNKNOWN');
  }
}

function evaluateSurfaceAccess(input: SurfaceAccessInput): Decision {
  if (!input || !input.business || typeof input.business.id !== 'string') {
    return deny('CATALOGUE_UNKNOWN');
  }

  const actor = input.actor;
  if (!actor) {
    return deny('UNAUTHENTICATED');
  }

  if (actor.kind === 'SYSTEM') {
    if (systemActorRejected(actor, input)) {
      return deny('UNAUTHENTICATED');
    }
  } else if (actor.kind === 'USER') {
    if (actor.active !== true) {
      return deny('USER_INACTIVE');
    }
    if (!KNOWN_ROLES.has(actor.role)) {
      return deny('ROLE_UNKNOWN');
    }
    if (input.trigger === 'SCHEDULED') {
      return deny('UNAUTHENTICATED');
    }
  } else {
    return deny('UNAUTHENTICATED');
  }

  if (!isCatalogueId(input.surfaceId) || !isSurfaceAction(input.action)) {
    return deny('CATALOGUE_UNKNOWN');
  }

  const spec = SURFACE_CATALOGUE[input.surfaceId];
  const actionPolicy = spec.actions[input.action];
  if (!actionPolicy) {
    return deny('CATALOGUE_UNKNOWN');
  }

  if (tenantMismatch(input, spec)) {
    return deny('SCOPE_TENANT_MISMATCH');
  }

  const billingClass = BILLING_CLASS[input.business.billing as keyof typeof BILLING_CLASS];
  if (!billingClass) {
    return deny('CATALOGUE_UNKNOWN');
  }

  let destinationMask = false;
  if (billingClass === 'CANCELLED') {
    if (actionPolicy.CANCELLED === 'DENY') {
      return deny('BILLING_CANCELLED');
    }
    if (spec.cancelledDestinationMask && input.action === 'VIEW') {
      destinationMask = true;
    }
  }

  if (actor.kind === 'USER' && !roleIsListed(actionPolicy.roles, actor.role)) {
    return deny('ROLE_FORBIDDEN');
  }

  const plan = resolveCanonicalPlan(input.business);
  if (!hasPlanAccess(plan, spec.minPlan)) {
    return deny('PLAN_BELOW_MINIMUM');
  }

  if (spec.requiresFeature) {
    const features = getFeatures(plan, normalizeStoreMode(input.business.storeMode), {
      onlineStorefront: Boolean(input.business.addonOnlineStorefront),
    });
    if (!features[spec.requiresFeature]) {
      return deny('ADDON_REQUIRED');
    }
  }

  if (input.business.isDemo === true && DEMO_DENIED_ACTIONS.has(input.action)) {
    return deny('BUSINESS_DEMO');
  }

  let readOnly = false;
  if (billingClass === 'RESTRICTED') {
    if (actionPolicy.RESTRICTED === 'DENY') {
      return deny('BILLING_RESTRICTED');
    }
    if (actionPolicy.RESTRICTED === 'RO') {
      readOnly = true;
    }
  }

  const scopeResult = resolveSurfaceScope(spec, plan, input.scope ?? {});
  if (!scopeResult.ok) {
    return deny(scopeResult.reason);
  }

  let appliedRange: AllowDecision['appliedRange'];
  if (spec.rangeCapped && input.range) {
    const todayLocal = todayLocalDate(input.now, input.timezone);
    const rangeResult = resolveAnalyticalRange({
      plan,
      todayLocal,
      requested: input.range,
    });
    if (!rangeResult.ok) {
      return deny('RANGE_EXCEEDS_PLAN', { clampHref: rangeResult.clampHref });
    }
    appliedRange = rangeResult.applied;
  }

  const deliveryDenial = deliveryDenialFor(input);
  if (deliveryDenial) return deliveryDenial;

  const allow: AllowDecision = { ok: true, scope: scopeResult.scope };
  if (readOnly) allow.readOnly = true;
  if (destinationMask) allow.destinationMask = true;
  if (appliedRange) allow.appliedRange = appliedRange;
  return allow;
}

function systemActorRejected(
  actor: Extract<SurfaceAccessInput['actor'], { kind: 'SYSTEM' }>,
  input: SurfaceAccessInput,
): boolean {
  if (typeof actor.invocationId !== 'string' || actor.invocationId.trim() === '') return true;
  const surfaces = SYSTEM_SURFACES[actor.authenticatedJob];
  if (!surfaces) return true;
  if (input.action !== 'SEND_DELIVERY' || input.trigger !== 'SCHEDULED') return true;
  return !surfaces.includes(input.surfaceId);
}

function tenantMismatch(input: SurfaceAccessInput, spec: SurfaceSpec): boolean {
  const actor = input.actor;
  if (!actor) return true;
  if (actor.kind === 'USER' && input.business.id !== actor.businessId) return true;

  const subjectBusinessId = input.scope?.subjectBusinessId;
  if (actor.kind === 'SYSTEM') {
    if (typeof subjectBusinessId !== 'string' || subjectBusinessId !== input.business.id) return true;
  } else if (typeof subjectBusinessId === 'string' && subjectBusinessId !== input.business.id) {
    return true;
  }

  if (
    actor.kind === 'USER' &&
    spec.scopeClass === 'TENANT_RECORD' &&
    actor.role === 'CASHIER' &&
    typeof input.scope?.recordOwnerUserId === 'string' &&
    input.scope.recordOwnerUserId !== actor.userId
  ) {
    return true;
  }

  return false;
}

function normalizeStoreMode(storeMode: string | null | undefined): 'SINGLE_STORE' | 'MULTI_STORE' | null {
  if (storeMode === 'SINGLE_STORE' || storeMode === 'MULTI_STORE') return storeMode;
  return null;
}

/**
 * Steps 17–21. `RECIPIENT_OPTED_OUT` is never returned.
 * Delivery checks apply to SEND_DELIVERY and to activation via CONFIGURE_DELIVERY.
 * They do not apply to DISABLE_DELIVERY or PREVIEW_DELIVERY.
 */
function deliveryDenialFor(input: SurfaceAccessInput): DenyDecision | null {
  if (input.action === 'SEND_DELIVERY') {
    return sendDeliveryDenial(input);
  }
  if (input.action === 'CONFIGURE_DELIVERY') {
    return configureDeliveryDenial(input);
  }
  return null;
}

function sendDeliveryDenial(input: SurfaceAccessInput): DenyDecision | null {
  const delivery = input.delivery;
  if (!delivery || delivery.enabled !== true || delivery.recipientStatus === 'DISABLED' || delivery.recipientStatus === 'ABSENT') {
    return deny('DELIVERY_DISABLED');
  }
  if (delivery.consentActive !== true) {
    return deny('CONSENT_MISSING');
  }
  if (delivery.verified !== true || delivery.recipientStatus !== 'VERIFIED') {
    return deny('DESTINATION_UNVERIFIED');
  }
  if (delivery.rateLimited === true) {
    return deny('DELIVERY_RATE_LIMITED', { retryAfterSeconds: delivery.retryAfterSeconds });
  }
  return null;
}

function configureDeliveryDenial(input: SurfaceAccessInput): DenyDecision | null {
  const delivery = input.delivery;
  if (!delivery) return null;
  if (delivery.purpose === 'ACTIVATE') {
    if (delivery.verified !== true || delivery.recipientStatus !== 'VERIFIED') {
      return deny('DESTINATION_UNVERIFIED');
    }
  }
  if (delivery.rateLimited === true) {
    return deny('DELIVERY_RATE_LIMITED', { retryAfterSeconds: delivery.retryAfterSeconds });
  }
  return null;
}

export function decideBusinessCapability(input: BusinessCapabilityInput): CapabilityDecision {
  try {
    return evaluateBusinessCapability(input);
  } catch {
    return { ok: false, reason: 'CATALOGUE_UNKNOWN' };
  }
}

function evaluateBusinessCapability(input: BusinessCapabilityInput): CapabilityDecision {
  if (!input || !input.business || typeof input.business.id !== 'string' || typeof input.business.canWrite !== 'boolean') {
    return { ok: false, reason: 'CATALOGUE_UNKNOWN' };
  }

  const actor = input.actor;
  if (!actor || actor.kind !== 'USER') {
    return { ok: false, reason: 'UNAUTHENTICATED' };
  }
  if (actor.active !== true) {
    return { ok: false, reason: 'USER_INACTIVE' };
  }
  if (!KNOWN_ROLES.has(actor.role)) {
    return { ok: false, reason: 'ROLE_UNKNOWN' };
  }
  if (input.capability !== BUSINESS_CAPABILITY) {
    return { ok: false, reason: 'CATALOGUE_UNKNOWN' };
  }
  if (input.business.id !== actor.businessId) {
    return { ok: false, reason: 'SCOPE_TENANT_MISMATCH' };
  }

  const billingClass = BILLING_CLASS[input.business.billing as keyof typeof BILLING_CLASS];
  if (!billingClass) {
    return { ok: false, reason: 'CATALOGUE_UNKNOWN' };
  }

  if (input.business.canWrite === true) {
    return { ok: true };
  }
  if (billingClass === 'CANCELLED') {
    return { ok: false, reason: 'BILLING_CANCELLED' };
  }
  return { ok: false, reason: 'BILLING_RESTRICTED' };
}

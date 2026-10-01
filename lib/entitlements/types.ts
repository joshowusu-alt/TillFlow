import type { BillingAccessState } from '@/lib/subscription-lifecycle';
import type { BusinessPlan } from '@/lib/features';
import { CONSOLIDATED_LABEL } from '@/lib/reports/scope-labels';

/**
 * Wave B-Core Stage 1 types.
 * Canonical actions, actors, denial reasons and catalogue fields from
 * contract sections B.3–B.6, D.1, D.2 and D.7.
 * `OPERATIONAL_WRITE` is a business capability, not a surface action.
 */

export const SURFACE_ACTIONS = [
  'VIEW',
  'EXPORT',
  'CONFIGURE_DELIVERY',
  'DISABLE_DELIVERY',
  'PREVIEW_DELIVERY',
  'SEND_DELIVERY',
] as const;

export type SurfaceAction = (typeof SURFACE_ACTIONS)[number];

export const BUSINESS_CAPABILITY = 'OPERATIONAL_WRITE' as const;
export type BusinessCapability = typeof BUSINESS_CAPABILITY;

export const ROLES = ['OWNER', 'MANAGER', 'CASHIER'] as const;
export type Role = (typeof ROLES)[number];

export const FEATURE_FLAGS = [
  'advancedReports',
  'advancedOps',
  'financialReports',
  'riskMonitor',
  'ownerIntelligence',
  'cashflowForecast',
  'auditLog',
  'onlineStorefront',
  'multiStore',
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

/** E.0 classes. `PER_MEMBER` is the export-pack row only. */
export const SCOPE_CLASSES = [
  'STORE_DIMENSIONAL',
  'ACCOUNTING_WHOLE_BUSINESS',
  'STOREFRONT_DOMAIN',
  'FIXED_CONSOLIDATED',
  'TENANT_CATALOG',
  'TENANT_ADMIN',
  'TENANT_RECORD',
  'NONE',
  'PER_MEMBER',
] as const;

export type ScopeClass = (typeof SCOPE_CLASSES)[number];

/** B.6 binding order. Index 0 is evaluated first. */
export const DENIAL_REASONS = [
  'UNAUTHENTICATED',
  'USER_INACTIVE',
  'ROLE_UNKNOWN',
  'CATALOGUE_UNKNOWN',
  'SCOPE_TENANT_MISMATCH',
  'BILLING_CANCELLED',
  'ROLE_FORBIDDEN',
  'PLAN_BELOW_MINIMUM',
  'ADDON_REQUIRED',
  'BUSINESS_DEMO',
  'BILLING_RESTRICTED',
  'SCOPE_STORE_INVALID',
  'SCOPE_CONSOLIDATED_FORBIDDEN',
  'SCOPE_STORE_NOT_OPERATIONAL',
  'SCOPE_STORE_UNSELECTED',
  'RANGE_EXCEEDS_PLAN',
  'DELIVERY_DISABLED',
  'CONSENT_MISSING',
  'DESTINATION_UNVERIFIED',
  'RECIPIENT_OPTED_OUT',
  'DELIVERY_RATE_LIMITED',
] as const;

export type DenialReason = (typeof DENIAL_REASONS)[number];

export const DENIAL_ROUTE_STATUS: Record<DenialReason, number> = {
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
};

export type BillingClass = 'OPEN' | 'RESTRICTED' | 'CANCELLED';

/**
 * B.4. Keys are the computed `BillingAccessState` union, so a new lifecycle
 * state fails compilation until it is classified. Unknown runtime strings
 * are not in this map and fail closed.
 */
export const BILLING_CLASS = {
  TRIAL_ACTIVE: 'OPEN',
  TRIAL_DUE_SOON: 'OPEN',
  TRIAL_DUE_TODAY: 'OPEN',
  TRIAL_EXPIRED_GRACE: 'OPEN',
  PAID_ACTIVE: 'OPEN',
  RENEWAL_DUE_SOON: 'OPEN',
  PAYMENT_DUE_TODAY: 'OPEN',
  PAYMENT_OVERDUE_GRACE: 'OPEN',
  TRIAL_RESTRICTED: 'RESTRICTED',
  PAYMENT_RESTRICTED: 'RESTRICTED',
  READ_ONLY: 'RESTRICTED',
  CANCELLED: 'CANCELLED',
} as const satisfies Record<BillingAccessState, BillingClass>;

export type ActionPolicy = {
  /** USER roles. An empty list means no user role may perform the action. SYSTEM skips the role step. */
  roles: readonly Role[];
  OPEN: 'ALLOW';
  RESTRICTED: 'ALLOW' | 'RO' | 'DENY';
  CANCELLED: 'ALLOW' | 'DENY';
};

export type SurfaceSpecBase = {
  id: string;
  actions: Partial<Record<SurfaceAction, ActionPolicy>>;
  minPlan: BusinessPlan;
  requiresFeature?: FeatureFlag;
  rangeCapped: boolean;
  /** F.2 Starter column removals. Present only where the contract names a column policy. */
  exportColumns?: { starterExcludes: readonly string[] };
  /** H.2 masked destination on CANCELLED VIEW. */
  cancelledDestinationMask?: boolean;
  /** F.5. Metadata for a later export stage. This stage does not write audit rows. */
  auditRequired?: boolean;
};

export type SurfaceSpec = SurfaceSpecBase &
  (
    | { scopeClass: 'STORE_DIMENSIONAL'; consolidationSupported: boolean }
    | { scopeClass: Exclude<ScopeClass, 'STORE_DIMENSIONAL'> }
  );

export type AuthenticatedJob = 'OWNER_DAILY_SUMMARY_ENQUEUE' | 'OWNER_DAILY_SUMMARY_DISPATCH';

export type EntitlementActor =
  | {
      kind: 'USER';
      userId: string;
      businessId: string;
      role: string;
      active: boolean;
    }
  | {
      kind: 'SYSTEM';
      authenticatedJob: AuthenticatedJob;
      invocationId: string;
    };

export type DeliveryTrigger = 'SCHEDULED' | 'MANUAL_TEST' | 'PREVIEW';
export type DeliveryPurpose = 'ACTIVATE' | 'REQUEST_CODE' | 'CHANGE_DESTINATION';
export type RecipientStatus = 'PENDING_VERIFICATION' | 'VERIFIED' | 'DISABLED' | 'ABSENT';
export type RangePreset = 'MONTH_TO_DATE' | 'LAST_30_DAYS' | 'CUSTOM';

export type SurfaceAccessInput = {
  surfaceId: string;
  action: string;
  trigger?: DeliveryTrigger | null;
  actor: EntitlementActor | null;
  business: {
    id: string;
    plan?: string | null;
    mode?: string | null;
    storeMode?: string | null;
    addonOnlineStorefront?: boolean | null;
    isDemo?: boolean | null;
    /** Computed billing access state. Never a raw subscriptionStatus shortcut. */
    billing: string;
  };
  scope?: {
    requestedStoreId?: string | null;
    ownedStoreIds?: readonly string[];
    operationalStoreId?: string | null;
    /** Row or document business id, when the caller has one. */
    subjectBusinessId?: string | null;
    /** Sale owner. Enforced for TENANT_RECORD cashiers when present. */
    recordOwnerUserId?: string | null;
    /** Sale store. Must belong to the tenant when present. */
    recordStoreId?: string | null;
  };
  range?: {
    fromLocalDate: string;
    toLocalDate: string;
    preset?: RangePreset;
  };
  delivery?: {
    enabled: boolean;
    recipientStatus: RecipientStatus;
    consentActive: boolean;
    verified: boolean;
    suppressed: boolean;
    rateLimited: boolean;
    retryAfterSeconds?: number;
    purpose?: DeliveryPurpose;
  };
  now: Date;
  timezone: string;
};

export type BusinessCapabilityInput = {
  actor: EntitlementActor | null;
  business: {
    id: string;
    billing: string;
    /**
     * Pass `getBillingEntitlement(...).canWrite`.
     * This function does not recompute the billing formula or the internal-QA exception.
     */
    canWrite: boolean;
  };
  capability: string;
};

export const WHOLE_BUSINESS_LABEL = 'Whole business — not separated by branch';
export { CONSOLIDATED_LABEL };
export const STOREFRONT_LABEL = 'Online storefront';

export type ResolvedScope =
  | { class: 'NONE' }
  | { class: 'PER_MEMBER' }
  | { class: 'TENANT_CATALOG' }
  | { class: 'TENANT_ADMIN' }
  | { class: 'TENANT_RECORD'; storeId: string | null }
  | { class: 'STORE_DIMENSIONAL'; mode: 'STORE'; storeId: string }
  | { class: 'STORE_DIMENSIONAL'; mode: 'ALL' }
  | { class: 'ACCOUNTING_WHOLE_BUSINESS'; label: typeof WHOLE_BUSINESS_LABEL }
  | { class: 'STOREFRONT_DOMAIN'; label: typeof STOREFRONT_LABEL }
  | { class: 'FIXED_CONSOLIDATED'; label: typeof CONSOLIDATED_LABEL };

export type AppliedRange = {
  fromLocalDate: string;
  toLocalDate: string;
  label: 'Month to date' | 'Last 30 days' | 'Custom';
};

export type AllowDecision = {
  ok: true;
  scope: ResolvedScope;
  readOnly?: boolean;
  destinationMask?: boolean;
  appliedRange?: AppliedRange;
};

export type DenyDecision = {
  ok: false;
  reason: DenialReason;
  clampHref?: string;
  retryAfterSeconds?: number;
};

export type Decision = AllowDecision | DenyDecision;

export type CapabilityDecision =
  | { ok: true }
  | { ok: false; reason: DenialReason };
